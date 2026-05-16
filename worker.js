const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};
const passwordIterations = 5000;
const newsCacheTtlSeconds = 60 * 30;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hexFromBuffer(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bufferFromHex(value) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function derivePasswordHash(password, salt, iterations = passwordIterations) {
  let input = new TextEncoder().encode(`${salt}:${String(password)}`);
  for (let index = 0; index < iterations; index += 1) {
    input = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  }
  return hexFromBuffer(input);
}

async function hashPassword(password) {
  const salt = randomToken();
  const hash = await derivePasswordHash(password, salt);
  return `sha256i$${passwordIterations}$${salt}$${hash}`;
}

async function verifyPassword(password, storedHash) {
  const [algorithm, iterations, salt, hash] = String(storedHash || "").split("$");
  if (algorithm !== "sha256i" || !iterations || !salt || !hash) {
    return false;
  }

  const candidate = await derivePasswordHash(password, salt, Number(iterations));
  if (candidate.length !== hash.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < candidate.length; index += 1) {
    diff |= candidate.charCodeAt(index) ^ hash.charCodeAt(index);
  }
  return diff === 0;
}

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function randomClassCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 28) || "alumno";
}

function routeParts(url) {
  return url.pathname.split("/").filter(Boolean);
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function stripHtml(value) {
  return decodeXmlEntities(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function xmlTagValue(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

function parseNewsRss(xml) {
  return [...String(xml || "").matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .slice(0, 8)
    .map(([item]) => {
      const title = xmlTagValue(item, "title");
      const link = xmlTagValue(item, "link");
      const source = xmlTagValue(item, "source");
      const publishedAt = xmlTagValue(item, "pubDate");
      return { title, link, source, publishedAt };
    })
    .filter((article) => article.title && article.link)
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt) || 0;
      const rightTime = Date.parse(right.publishedAt) || 0;
      return rightTime - leftTime;
    });
}

function newsSearchQuery(municipality, island) {
  return [
    `"${municipality}"`,
    island ? `"${island}"` : "",
    "Canarias"
  ].filter(Boolean).join(" ");
}

async function recentMunicipalityNews(url) {
  const municipality = String(url.searchParams.get("municipality") || "").trim().slice(0, 80);
  const island = String(url.searchParams.get("island") || "").trim().slice(0, 80);
  if (!municipality) {
    return json({ articles: [] }, 400);
  }

  const rssUrl = new URL("https://news.google.com/rss/search");
  rssUrl.searchParams.set("q", `${newsSearchQuery(municipality, island)} when:30d`);
  rssUrl.searchParams.set("hl", "es");
  rssUrl.searchParams.set("gl", "ES");
  rssUrl.searchParams.set("ceid", "ES:es");

  const response = await fetch(rssUrl, {
    headers: {
      "Accept": "application/rss+xml, application/xml, text/xml",
      "User-Agent": "GeoLearn Canarias news reader"
    },
    cf: { cacheTtl: newsCacheTtlSeconds, cacheEverything: true }
  });

  if (!response.ok) {
    return json({ articles: [] }, 502);
  }

  return json({
    articles: parseNewsRss(await response.text())
  });
}

async function createSession(env, role, { studentId = null, teacherId = null } = {}) {
  const token = randomToken();
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 14;

  await env.DB.prepare(
    "INSERT INTO sessions (token, role, student_id, teacher_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).bind(token, role, studentId, teacherId, expiresAt).run();

  return token;
}

async function getSession(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return null;
  }

  const session = await env.DB.prepare(
    "SELECT token, role, student_id, teacher_id FROM sessions WHERE token = ? AND expires_at > ?"
  ).bind(token, Date.now()).first();

  return session || null;
}

async function requireTeacher(request, env) {
  const session = await getSession(request, env);
  return session?.role === "teacher" && session.teacher_id ? session : null;
}

async function requireStudent(request, env) {
  const session = await getSession(request, env);
  return session?.role === "student" && session.student_id ? session : null;
}

async function studentForTeacher(env, studentId, teacherId) {
  return env.DB.prepare(`
    SELECT s.id
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE s.id = ? AND c.teacher_id = ?
  `).bind(studentId, teacherId).first();
}

async function classForTeacher(env, classId, teacherId) {
  return env.DB.prepare(
    "SELECT id, name FROM classes WHERE id = ? AND teacher_id = ?"
  ).bind(classId, teacherId).first();
}

async function uniqueUsername(env, displayName) {
  const base = slugify(displayName);
  let username = base;
  let suffix = 2;

  while (await env.DB.prepare("SELECT id FROM students WHERE username = ?").bind(username).first()) {
    username = `${base}.${suffix}`;
    suffix += 1;
  }

  return username;
}

async function uniqueClassCode(env) {
  let code = randomClassCode();

  while (await env.DB.prepare("SELECT id FROM classes WHERE class_code = ?").bind(code).first()) {
    code = randomClassCode();
  }

  return code;
}

async function classByCode(env, classCode) {
  if (!classCode) {
    return null;
  }

  return env.DB.prepare(
    "SELECT id, name, class_code, created_at FROM classes WHERE class_code = ?"
  ).bind(String(classCode).trim().toUpperCase()).first();
}

async function teacherSummary(env, teacherId) {
  const classes = await env.DB.prepare(
    "SELECT id, name, class_code, created_at FROM classes WHERE teacher_id = ? ORDER BY created_at DESC"
  ).bind(teacherId).all();
  const students = await env.DB.prepare(`
    SELECT
      s.id,
      s.class_id,
      s.username,
      s.display_name,
      s.pin,
      s.created_at,
      COUNT(a.id) AS attempts,
      COALESCE(SUM(a.correct), 0) AS correct,
      COALESCE(ROUND(100.0 * SUM(a.correct) / NULLIF(COUNT(a.id), 0), 1), 0) AS accuracy
    FROM students s
    JOIN classes c ON c.id = s.class_id
    LEFT JOIN attempts a ON a.student_id = s.id
    WHERE c.teacher_id = ?
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `).bind(teacherId).all();
  const recentAttempts = await env.DB.prepare(`
    SELECT
      a.id,
      a.province_name,
      a.correct,
      a.created_at,
      s.display_name,
      s.username,
      c.name AS class_name
    FROM attempts a
    JOIN students s ON s.id = a.student_id
    JOIN classes c ON c.id = s.class_id
    WHERE c.teacher_id = ?
    ORDER BY a.created_at DESC
    LIMIT 30
  `).bind(teacherId).all();

  return {
    classes: classes.results || [],
    students: students.results || [],
    recentAttempts: recentAttempts.results || []
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const parts = routeParts(url);
  const method = request.method;

  if (method === "POST" && parts.join("/") === "api/teacher/login") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);

    const teacher = await env.DB.prepare(
      "SELECT id, email, password_hash FROM teachers WHERE email = ?"
    ).bind(email).first();

    if (!teacher || !(await verifyPassword(body.password, teacher.password_hash))) {
      return json({ error: "Email o contrasena incorrectos" }, 401);
    }

    return json({
      token: await createSession(env, "teacher", { teacherId: teacher.id }),
      teacher: { id: teacher.id, email: teacher.email }
    });
  }

  if (method === "POST" && parts.join("/") === "api/teacher/register") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");

    if (!isValidEmail(email)) {
      return json({ error: "Introduce un email valido" }, 400);
    }
    if (password.length < 8) {
      return json({ error: "La contrasena debe tener al menos 8 caracteres" }, 400);
    }

    const exists = await env.DB.prepare("SELECT id FROM teachers WHERE email = ?").bind(email).first();
    if (exists) {
      return json({ error: "Ya existe una cuenta con ese email" }, 409);
    }

    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO teachers (id, email, password_hash, created_at) VALUES (?, ?, ?, datetime('now'))"
    ).bind(id, email, await hashPassword(password)).run();

    return json({
      token: await createSession(env, "teacher", { teacherId: id }),
      teacher: { id, email }
    });
  }

  if (method === "POST" && parts.join("/") === "api/student/login") {
    const body = await readJson(request);
    const scopedClass = await classByCode(env, body.classCode || "");
    if (body.classCode && !scopedClass) {
      return json({ error: "Codigo de clase no valido" }, 404);
    }

    const student = await env.DB.prepare(`
      SELECT s.id, s.username, s.display_name, s.class_id, c.name AS class_name, c.class_code
      FROM students s
      JOIN classes c ON c.id = s.class_id
      WHERE s.username = ? AND s.pin = ?
      ${scopedClass ? "AND s.class_id = ?" : ""}
    `).bind(
      body.username || "",
      body.pin || "",
      ...(scopedClass ? [scopedClass.id] : [])
    ).first();

    if (!student) {
      return json({ error: "Usuario o PIN incorrectos" }, 401);
    }

    return json({ token: await createSession(env, "student", { studentId: student.id }), student });
  }

  if (parts[0] !== "api") {
    return null;
  }

  if (method === "GET" && parts.join("/") === "api/teacher/summary") {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    return json(await teacherSummary(env, session.teacher_id));
  }

  if (method === "GET" && parts.join("/") === "api/classroom") {
    const classCode = url.searchParams.get("code") || "";
    const classroom = await classByCode(env, classCode);
    if (!classroom) {
      return json({ error: "Clase no encontrada" }, 404);
    }

    return json({ classroom });
  }

  if (method === "GET" && parts.join("/") === "api/news") {
    return recentMunicipalityNews(url);
  }

  if (method === "POST" && parts.join("/") === "api/classes") {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const body = await readJson(request);
    const name = String(body.name || "").trim();
    if (!name) {
      return json({ error: "El nombre de la clase es obligatorio" }, 400);
    }

    const id = crypto.randomUUID();
    const classCode = await uniqueClassCode(env);
    await env.DB.prepare(
      "INSERT INTO classes (id, teacher_id, name, class_code, created_at) VALUES (?, ?, ?, ?, datetime('now'))"
    ).bind(id, session.teacher_id, name, classCode).run();

    return json({ id, name, class_code: classCode });
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "classes" && parts[3] === "students") {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const classId = parts[2];
    const body = await readJson(request);
    const displayName = String(body.displayName || "").trim();
    if (!displayName) {
      return json({ error: "El nombre del alumno es obligatorio" }, 400);
    }

    const classExists = await env.DB.prepare(
      "SELECT id FROM classes WHERE id = ? AND teacher_id = ?"
    ).bind(classId, session.teacher_id).first();
    if (!classExists) {
      return json({ error: "La clase no existe" }, 404);
    }

    const id = crypto.randomUUID();
    const username = await uniqueUsername(env, body.username || displayName);
    const pin = randomPin();

    await env.DB.prepare(`
      INSERT INTO students (id, class_id, username, pin, display_name, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(id, classId, username, pin, displayName).run();

    return json({ id, class_id: classId, username, pin, display_name: displayName });
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "classes" && parts[3] === "students-bulk") {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const classId = parts[2];
    if (!(await classForTeacher(env, classId, session.teacher_id))) {
      return json({ error: "La clase no existe" }, 404);
    }

    const body = await readJson(request);
    const names = String(body.names || "")
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);

    const uniqueNames = [...new Set(names)].slice(0, 80);
    if (!uniqueNames.length) {
      return json({ error: "Pega al menos un nombre de alumno" }, 400);
    }

    const created = [];
    for (const displayName of uniqueNames) {
      const id = crypto.randomUUID();
      const username = await uniqueUsername(env, displayName);
      const pin = randomPin();
      await env.DB.prepare(`
        INSERT INTO students (id, class_id, username, pin, display_name, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(id, classId, username, pin, displayName).run();
      created.push({ id, class_id: classId, username, pin, display_name: displayName });
    }

    return json({ created });
  }

  if (method === "DELETE" && parts[0] === "api" && parts[1] === "classes" && parts.length === 3) {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const classId = parts[2];
    if (!(await classForTeacher(env, classId, session.teacher_id))) {
      return json({ error: "La clase no existe" }, 404);
    }

    await env.DB.prepare(`
      DELETE FROM attempts
      WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)
    `).bind(classId).run();
    await env.DB.prepare(`
      DELETE FROM sessions
      WHERE student_id IN (SELECT id FROM students WHERE class_id = ?)
    `).bind(classId).run();
    await env.DB.prepare("DELETE FROM students WHERE class_id = ?").bind(classId).run();
    await env.DB.prepare("DELETE FROM classes WHERE id = ? AND teacher_id = ?").bind(classId, session.teacher_id).run();

    return json({ ok: true });
  }

  if (method === "POST" && parts[0] === "api" && parts[1] === "students" && parts[3] === "pin") {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const studentId = parts[2];
    if (!(await studentForTeacher(env, studentId, session.teacher_id))) {
      return json({ error: "Alumno no encontrado" }, 404);
    }

    const pin = randomPin();
    await env.DB.prepare("UPDATE students SET pin = ? WHERE id = ?").bind(pin, studentId).run();
    return json({ id: studentId, pin });
  }

  if (method === "DELETE" && parts[0] === "api" && parts[1] === "students" && parts[3] === "stats") {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const studentId = parts[2];
    if (!(await studentForTeacher(env, studentId, session.teacher_id))) {
      return json({ error: "Alumno no encontrado" }, 404);
    }

    await env.DB.prepare("DELETE FROM attempts WHERE student_id = ?").bind(studentId).run();
    return json({ ok: true });
  }

  if (method === "DELETE" && parts[0] === "api" && parts[1] === "students" && parts.length === 3) {
    const session = await requireTeacher(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const studentId = parts[2];
    if (!(await studentForTeacher(env, studentId, session.teacher_id))) {
      return json({ error: "Alumno no encontrado" }, 404);
    }

    await env.DB.prepare("DELETE FROM attempts WHERE student_id = ?").bind(studentId).run();
    await env.DB.prepare("DELETE FROM sessions WHERE student_id = ?").bind(studentId).run();
    await env.DB.prepare("DELETE FROM students WHERE id = ?").bind(studentId).run();
    return json({ ok: true });
  }

  if (method === "GET" && parts.join("/") === "api/student/me") {
    const session = await requireStudent(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const student = await env.DB.prepare(`
      SELECT s.id, s.username, s.display_name, c.name AS class_name
      FROM students s
      JOIN classes c ON c.id = s.class_id
      WHERE s.id = ?
    `).bind(session.student_id).first();

    return json({ student });
  }

  if (method === "POST" && parts.join("/") === "api/attempts") {
    const session = await requireStudent(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const body = await readJson(request);
    await env.DB.prepare(`
      INSERT INTO attempts (student_id, province_code, province_name, correct, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(
      session.student_id,
      String(body.provinceCode || ""),
      String(body.provinceName || ""),
      body.correct ? 1 : 0
    ).run();

    return json({ ok: true });
  }

  if (method === "GET" && parts.join("/") === "api/student/stats") {
    const session = await requireStudent(request, env);
    if (!session) {
      return json({ error: "No autorizado" }, 401);
    }

    const stats = await env.DB.prepare(`
      SELECT
        COUNT(id) AS attempts,
        COALESCE(SUM(correct), 0) AS correct,
        COUNT(DISTINCT CASE WHEN correct = 1 THEN province_code END) AS provinces_hit
      FROM attempts
      WHERE student_id = ?
    `).bind(session.student_id).first();

    return json({ stats });
  }

  return json({ error: "No encontrado" }, 404);
}

export default {
  async fetch(request, env) {
    const apiResponse = await handleApi(request, env);
    if (apiResponse) {
      return apiResponse;
    }

    return env.ASSETS.fetch(request);
  }
};
