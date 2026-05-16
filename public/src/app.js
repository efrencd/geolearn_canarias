const appRoot = document.querySelector("#appRoot");
const svgNS = "http://www.w3.org/2000/svg";
const mapWidth = 1000;
const mapHeight = 720;
const roundSize = 10;
const mapViewport = { x: 48, y: 40, width: 904, height: 640 };
const summaryLabelFontSize = 11.2;
const summaryLabelStrokeWidth = 2.8;
const mobileSummaryLabelFontSize = 30.8;
const mobileSummaryLabelStrokeWidth = 5.6;
const mobileBreakpoint = 620;
const labelOffsets = {
  "La Laguna": { x: 0, y: 10 },
  "San Juan de la Rambla": { x: 0, y: 1 },
  "Santa Lucía de Tirajana": { x: 0, y: 2 },
  "Pájara": { x: 11, y: 0 },
  "La Oliva": { x: 0, y: 6 },
  "Teguise": { x: -5, y: 35 },
  "Tinajo": { x: 0, y: 8 },
  "Arrecife": { x: -2, y: -2 },
  "El Tanque": { x: 2, y: 0 },
  "Garachico": { x: 2, y: 0 },
  "La Orotava": { x: 3, y: 0 },
  "Tacoronte": { x: 0, y: 2 },
  "Icod de los Vinos": { x: 0, y: 3 },
  "Santiago del Teide": { x: 2, y: -1 },
  "Guia de Isora": { x: 0, y: -3 },
  "Guía de Isora": { x: 0, y: -3 },
  "Arafo": { x: 0, y: 2 },
  "El Rosario": { x: -3, y: -2 }
};
const hiddenMunicipalityLabels = new Set();
const requestedClassCode = (
  new URLSearchParams(window.location.search).get("clase") ||
  new URLSearchParams(window.location.search).get("class") ||
  new URLSearchParams(window.location.search).get("classCode") ||
  ""
).trim().toUpperCase();

const state = {
  features: [],
  geologicalSites: [],
  municipalityInfo: {},
  wikipediaInfo: {},
  newsInfo: {},
  municipalityInfoTab: "wikipedia",
  studentToken: localStorage.getItem("studentToken") || "",
  teacherToken: localStorage.getItem("teacherToken") || "",
  student: null,
  teacher: null,
  summary: null,
  classroom: null,
  classCode: requestedClassCode,
  currentTarget: null,
  roundQueue: [],
  roundNumber: 1,
  questionNumber: 0,
  score: 0,
  attempts: 0,
  roundScore: 0,
  roundResults: {},
  roundLimit: roundSize,
  selectedMunicipalityCode: "",
  selectedGeologicalSiteId: "",
  selectedIslandFilter: "ALL",
  selectedContentFilter: "municipalities",
  gameRoundStarted: true,
  locked: false,
  roundComplete: false,
  mode: "student",
  playMode: "game"
};

function isMobileLikeViewport() {
  return window.innerWidth <= mobileBreakpoint || window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function isMobileMenuViewport() {
  return window.innerWidth <= 1100;
}

let previousMobileMenuViewport = isMobileMenuViewport();

function closeMobileMenu() {
  document.body.classList.remove("is-mobile-menu-open");
  document.querySelector("[data-menu-toggle]")?.setAttribute("aria-expanded", "false");
}

function syncMobileMenuForViewport(force = false) {
  const isMobileViewport = isMobileMenuViewport();
  if ((force === true || (!previousMobileMenuViewport && isMobileViewport)) && isMobileViewport) {
    closeMobileMenu();
  }
  previousMobileMenuViewport = isMobileViewport;
}

function isMacDesktopPlatform() {
  const platform = String(navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();
  return platform.includes("mac") && navigator.maxTouchPoints < 2;
}

function wheelDeltaPixels(event, axis = "Y") {
  const delta = axis === "X" ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return delta * 33;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return delta * (axis === "X" ? window.innerWidth : window.innerHeight);
  }
  return delta;
}

function isTrackpadPanWheel(event, deltaX, deltaY) {
  if (event.ctrlKey || event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
    return false;
  }

  const absX = Math.abs(deltaX);
  return absX > 0 && absX >= Math.abs(deltaY) * 0.2;
}

function syncDynamicTopbarHeight() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) {
    return;
  }
  const height = Math.ceil(topbar.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--dynamic-topbar-height", `${height}px`);
}

function blockBrowserGestureZoom() {
  // iOS Safari fires gesture* events for page zoom. Preventing them keeps pinch reserved for map logic.
  const prevent = (event) => event.preventDefault();
  document.addEventListener("gesturestart", prevent, { passive: false });
  document.addEventListener("gesturechange", prevent, { passive: false });
  document.addEventListener("gestureend", prevent, { passive: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatWikipediaExtract(value) {
  const paragraphs = String(value || "")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !/^=+/.test(paragraph))
    .slice(0, 3);

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function formatNewsDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  return fetch(path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Error de servidor");
    }
    return data;
  });
}

function classroomUrl(classCode) {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("clase", classCode);
  return url.toString();
}

function titleCase(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

  return normalized.replace(/\b(De|Del|La|Las|Los|El|Y)\b/g, (match, word, offset) => {
    return offset === 0 ? word : word.toLowerCase();
  });
}

function municipalityName(feature) {
  return titleCase(feature.properties.nombre);
}

function municipalityCode(feature) {
  return String(feature.properties.codigo);
}

function islandName(feature) {
  return titleCase(feature.properties.isla);
}

function islandFilters() {
  const names = [
    ...new Set([
      ...state.features.map((feature) => islandName(feature)),
      ...state.geologicalSites.map((site) => site.island)
    ])
  ];
  return names.sort((a, b) => a.localeCompare(b, "es"));
}

function contentFilterLabel(value = state.selectedContentFilter) {
  if (value === "geological") {
    return "Puntos geologicos";
  }
  if (value === "both") {
    return "Municipios y puntos";
  }
  return "Municipios";
}

function siteId(site) {
  return site.id;
}

function siteName(site) {
  return site.name;
}

function siteIsland(site) {
  return site.island;
}

function targetType(target) {
  return target?.targetType || "municipality";
}

function isGeologicalTarget(target) {
  return targetType(target) === "geological";
}

function targetId(target) {
  return isGeologicalTarget(target) ? siteId(target) : municipalityCode(target);
}

function targetResultKey(target) {
  return `${targetType(target)}:${targetId(target)}`;
}

function targetName(target) {
  return isGeologicalTarget(target) ? siteName(target) : municipalityName(target);
}

function targetIsland(target) {
  return isGeologicalTarget(target) ? siteIsland(target) : islandName(target);
}

function targetKindLabel(target) {
  return isGeologicalTarget(target) ? "Punto geologico actual" : "Municipio actual";
}

function targetRecordCode(target) {
  return isGeologicalTarget(target) ? `geo:${siteId(target)}` : municipalityCode(target);
}

function mapPointForSite(site) {
  return [Number(site.lng), Number(site.lat)];
}

function shuffle(items) {
  const shuffled = items.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function adjustedPoint(point, latitudeCorrection = 1) {
  const [lon, lat] = point;
  return [lon * latitudeCorrection, lat];
}

function forEachRing(feature, callback) {
  if (feature.geometry.type === "Polygon") {
    feature.geometry.coordinates.forEach(callback);
    return;
  }

  if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates.forEach((polygon) => polygon.forEach(callback));
  }
}

function createBounds(features, latitudeCorrection) {
  const bounds = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity };

  features.forEach((feature) => {
    forEachRing(feature, (ring) => {
      ring.forEach((point) => {
        const [lon, lat] = adjustedPoint(point, latitudeCorrection);
        bounds.minLon = Math.min(bounds.minLon, lon);
        bounds.maxLon = Math.max(bounds.maxLon, lon);
        bounds.minLat = Math.min(bounds.minLat, lat);
        bounds.maxLat = Math.max(bounds.maxLat, lat);
      });
    });
  });

  return bounds;
}

function meanLatitude(features) {
  let total = 0;
  let count = 0;

  features.forEach((feature) => {
    forEachRing(feature, (ring) => {
      ring.forEach(([, lat]) => {
        total += lat;
        count += 1;
      });
    });
  });

  return count ? total / count : 28.4;
}

function createProjection(features, viewport) {
  const latitudeCorrection = Math.cos((meanLatitude(features) * Math.PI) / 180);
  const { minLon, maxLon, minLat, maxLat } = createBounds(features, latitudeCorrection);
  const scale = Math.min(viewport.width / (maxLon - minLon), viewport.height / (maxLat - minLat));
  const mapBoundsWidth = (maxLon - minLon) * scale;
  const mapBoundsHeight = (maxLat - minLat) * scale;
  const offsetX = viewport.x + (viewport.width - mapBoundsWidth) / 2;
  const offsetY = viewport.y + (viewport.height - mapBoundsHeight) / 2;

  return (point) => {
    const [lon, lat] = adjustedPoint(point, latitudeCorrection);
    return [
      offsetX + (lon - minLon) * scale,
      offsetY + (maxLat - lat) * scale
    ];
  };
}

function ringToPath(ring, project) {
  return ring
    .map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ")
    .concat(" Z");
}

function featureToPath(feature, project) {
  const paths = [];
  forEachRing(feature, (ring) => paths.push(ringToPath(ring, project)));
  return paths.join(" ");
}

function projectedFeatureBounds(features) {
  const project = createProjection(state.features, mapViewport);
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

  features.forEach((feature) => {
    forEachRing(feature, (ring) => {
      ring.forEach((point) => {
        const [x, y] = project(point);
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      });
    });
  });

  return Number.isFinite(bounds.minX) ? bounds : null;
}

function projectedPointBounds(point, padding = 8) {
  const project = createProjection(state.features, mapViewport);
  const [x, y] = project(point);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    minX: x - padding,
    maxX: x + padding,
    minY: y - padding,
    maxY: y + padding
  };
}

function targetBounds(target) {
  if (!target) {
    return null;
  }
  if (isGeologicalTarget(target) && state.playMode !== "game") {
    return projectedPointBounds(mapPointForSite(target), window.innerWidth <= mobileBreakpoint ? 18 : 12);
  }
  const islandFeatures = state.features.filter((feature) => islandName(feature) === targetIsland(target));
  return projectedFeatureBounds(islandFeatures);
}

function polygonCentroid(feature) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  forEachRing(feature, (ring) => {
    ring.forEach(([lon, lat]) => {
      sumX += lon;
      sumY += lat;
      count += 1;
    });
  });

  return count ? [sumX / count, sumY / count] : null;
}

function createMap(onPick, options = {}) {
  const showLabels = Boolean(options.showLabels);
  const showGeologicalSites = Boolean(options.showGeologicalSites);
  const results = options.results || {};
  const onInfoSelect = options.onInfoSelect || null;
  const onSitePick = options.onSitePick || null;
  const onSiteInfoSelect = options.onSiteInfoSelect || null;
  const svg = document.createElementNS(svgNS, "svg");
  const defs = document.createElementNS(svgNS, "defs");
  const seaGradient = document.createElementNS(svgNS, "linearGradient");
  const seaStopTop = document.createElementNS(svgNS, "stop");
  const seaStopMid = document.createElementNS(svgNS, "stop");
  const seaStopBottom = document.createElementNS(svgNS, "stop");
  const seaRect = document.createElementNS(svgNS, "rect");
  const islandShadowLayer = document.createElementNS(svgNS, "g");
  const labelLayer = document.createElementNS(svgNS, "g");
  const siteLayer = document.createElementNS(svgNS, "g");
  const project = createProjection(state.features, mapViewport);

  svg.setAttribute("viewBox", `0 0 ${mapWidth} ${mapHeight}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    showLabels
      ? "Mapa de Canarias con nombres de municipios"
      : "Mapa interactivo de municipios de Canarias"
  );
  islandShadowLayer.classList.add("island-shadow-layer");
  labelLayer.classList.add("province-labels");
  siteLayer.classList.add("geological-sites");
  if (onInfoSelect) {
    labelLayer.classList.add("is-interactive");
  }
  seaGradient.setAttribute("id", "seaGradient");
  seaGradient.setAttribute("x1", "0");
  seaGradient.setAttribute("y1", "0");
  seaGradient.setAttribute("x2", "0");
  seaGradient.setAttribute("y2", String(mapHeight));
  seaGradient.setAttribute("gradientUnits", "userSpaceOnUse");
  seaStopTop.setAttribute("offset", "0%");
  seaStopTop.setAttribute("stop-color", "#d6ebf6");
  seaStopMid.setAttribute("offset", "52%");
  seaStopMid.setAttribute("stop-color", "#8ec8e8");
  seaStopBottom.setAttribute("offset", "100%");
  seaStopBottom.setAttribute("stop-color", "#74b5df");
  seaGradient.append(seaStopTop, seaStopMid, seaStopBottom);
  defs.append(seaGradient);
  svg.append(defs);
  const mobileSea = window.innerWidth <= mobileBreakpoint;
  const seaPadX = mobileSea
    ? Math.max(360, Math.round(window.innerWidth * 0.9))
    : Math.max(220, Math.round(window.innerWidth * 0.35));
  const seaPadY = mobileSea
    ? Math.max(520, Math.round(window.innerHeight * 1.2))
    : Math.max(240, Math.round(window.innerHeight * 0.45));
  seaRect.setAttribute("x", String(-seaPadX));
  seaRect.setAttribute("y", String(-seaPadY));
  seaRect.setAttribute("width", String(mapWidth + seaPadX * 2));
  seaRect.setAttribute("height", String(mapHeight + seaPadY * 2));
  seaRect.setAttribute("fill", "url(#seaGradient)");
      svg.append(seaRect);
  svg.append(islandShadowLayer);

  state.features
    .slice()
    .sort((a, b) => municipalityName(a).localeCompare(municipalityName(b), "es"))
    .forEach((feature) => {
      const code = municipalityCode(feature);
      const name = municipalityName(feature);
      const island = islandName(feature);
      const group = document.createElementNS(svgNS, "g");
      const islandShadowPath = document.createElementNS(svgNS, "path");
      const path = document.createElementNS(svgNS, "path");

      group.classList.add("province");
      const result = results[`municipality:${code}`];
      if (result === true) {
        group.classList.add("is-review-correct");
      } else if (result === false) {
        group.classList.add("is-review-wrong");
      }
      group.dataset.code = code;
      group.dataset.name = name;
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `${name}, ${island}`);
      const pathData = featureToPath(feature, project);
      islandShadowPath.setAttribute("d", pathData);
      islandShadowPath.setAttribute("fill-rule", "evenodd");
      path.setAttribute("d", pathData);
      path.setAttribute("fill-rule", "evenodd");
      islandShadowLayer.append(islandShadowPath);
      group.append(path);

      if (onPick) {
        group.addEventListener("click", (event) => handleMapSelectionClick(event, () => onPick(feature, group)));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPick(feature, group);
          }
        });
      } else if (onInfoSelect) {
        group.addEventListener("click", (event) => handleMapSelectionClick(event, () => onInfoSelect(feature)));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onInfoSelect(feature);
          }
        });
      } else {
        group.classList.add("is-static");
      }

      svg.append(group);

      if (showLabels) {
        const point = polygonCentroid(feature);
        if (point && !hiddenMunicipalityLabels.has(name)) {
          const [x, y] = project(point);
          const offset = labelOffsets[name] || { x: 0, y: 0 };
          const text = document.createElementNS(svgNS, "text");
          text.textContent = name;
          text.setAttribute("x", (x + offset.x).toFixed(1));
          text.setAttribute("y", (y + offset.y).toFixed(1));
          if (onInfoSelect) {
            text.classList.add("is-clickable");
            text.addEventListener("click", (event) => handleMapSelectionClick(event, () => onInfoSelect(feature)));
          }
          labelLayer.append(text);
        }
      }
    });

  if (showLabels) {
    svg.append(labelLayer);
  }

  if (showGeologicalSites) {
    state.geologicalSites.forEach((site) => {
      const [x, y] = project(mapPointForSite(site));
      const group = document.createElementNS(svgNS, "g");
      const hitArea = document.createElementNS(svgNS, "circle");
      const halo = document.createElementNS(svgNS, "circle");
      const star = document.createElementNS(svgNS, "path");
      const result = results[targetResultKey({ ...site, targetType: "geological" })];

      group.classList.add("geological-site");
      if (result === true) {
        group.classList.add("is-review-correct");
      } else if (result === false) {
        group.classList.add("is-review-wrong");
      }
      group.dataset.siteId = siteId(site);
      group.setAttribute("tabindex", "0");
      group.setAttribute("role", "button");
      group.setAttribute("aria-label", `${siteName(site)}, ${siteIsland(site)}`);
      group.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);

      hitArea.classList.add("geological-site-hit-area");
      hitArea.setAttribute("r", "24");
      halo.setAttribute("r", "10.6");
      star.setAttribute("d", "M0 -10.3 8.8 -1.8 4.4 9.2 -4.4 9.2 -8.8 -1.8Z M0 -4.6 3.7 -0.9 1.9 4.2 -1.9 4.2 -3.7 -0.9Z");
      group.append(hitArea, halo, star);

      if (onSitePick) {
        group.addEventListener("click", (event) => handleMapSelectionClick(event, () => onSitePick(site, group)));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSitePick(site, group);
          }
        });
      } else if (onSiteInfoSelect) {
        group.addEventListener("click", (event) => handleMapSelectionClick(event, () => onSiteInfoSelect(site)));
        group.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSiteInfoSelect(site);
          }
        });
      } else {
        group.classList.add("is-static");
      }

      siteLayer.append(group);
    });
    svg.append(siteLayer);
  }

  return svg;
}

function teacherIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 1.8 8.4 12 14l8.2-4.4V16h2V8.4L12 3Zm-6 9.8v3.4C6 18.7 8.9 21 12 21s6-2.3 6-4.8v-3.4l-6 3.2-6-3.2Zm4.2 2.3h3.6v1.8h-3.6v-1.8Z"></path>
    </svg>
  `;
}

function gamepadIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 9.5a5 5 0 0 0-4.9 4l-.6 2.8a3 3 0 0 0 5.1 2.7l1.9-1.9h7l1.9 1.9a3 3 0 0 0 5.1-2.7l-.6-2.8a5 5 0 0 0-4.9-4H7Zm2 2v2h2v1H9v2H8v-2H6v-1h2v-2h1Zm8.25.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm2.5 2.75a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z"></path>
    </svg>
  `;
}

function learningIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Zm2.5-.5a.5.5 0 0 0-.5.5v11.6c.16-.06.33-.1.5-.1H18V5H6.5ZM8 8h8v1.6H8V8Zm0 3h8v1.6H8V11Z"></path>
    </svg>
  `;
}

function backIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.2 5.3 3.5 12l6.7 6.7 1.4-1.4-4.3-4.3H20v-2H7.3l4.3-4.3-1.4-1.4Z"></path>
    </svg>
  `;
}

function peopleIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.2 11.2a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Zm7.7-.2a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2.8 20v-2.1c0-2.8 2.4-5 5.4-5s5.4 2.2 5.4 5V20H2.8Zm12.1 0v-2.1c0-1.9-.8-3.6-2.1-4.7.8-.4 1.8-.7 2.9-.7 2.8 0 5.1 2 5.1 4.7V20h-5.9Z"></path>
    </svg>
  `;
}

function globeIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18Zm-4.2-7.8c.2 1.8.8 3.4 1.7 4.5.4.5.8.9 1.3 1.1v-5.6h-3Zm5.4 5.6c.5-.2.9-.6 1.3-1.1.9-1.1 1.5-2.7 1.7-4.5h-3v5.6Zm-5.4-8h3V5.2c-.5.2-.9.6-1.3 1.1-.9 1.1-1.5 2.7-1.7 4.5Zm5.4 0h3c-.2-1.8-.8-3.4-1.7-4.5-.4-.5-.8-.9-1.3-1.1v5.6Zm5.4 2.4c-.2 1.5-.6 2.8-1.2 4 1-.9 1.8-2.3 2.1-4h-.9Zm-14.1 0c.3 1.7 1 3.1 2.1 4-.6-1.2-1-2.5-1.2-4h-.9Zm14.1-2.4h.9c-.3-1.7-1-3.1-2.1-4 .6 1.2 1 2.5 1.2 4Zm-14.1 0h.9c.2-1.5.6-2.8 1.2-4-1 .9-1.8 2.3-2.1 4Z"></path>
    </svg>
  `;
}

function siteIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9L12 2.5Z"></path>
    </svg>
  `;
}

let pendingMapSelection = null;
let suppressMapSelectionUntil = 0;
const mapSelectionDelay = 180;

function cancelPendingMapSelection() {
  if (!pendingMapSelection) {
    return;
  }
  window.clearTimeout(pendingMapSelection);
  pendingMapSelection = null;
}

function handleMapSelectionClick(event, action) {
  if (isMapSelectionSuppressed()) {
    event.preventDefault();
    cancelPendingMapSelection();
    return;
  }

  if (event.detail > 1) {
    event.preventDefault();
    cancelPendingMapSelection();
    return;
  }

  if (event.detail === 0) {
    action();
    return;
  }

  cancelPendingMapSelection();
  pendingMapSelection = window.setTimeout(() => {
    pendingMapSelection = null;
    action();
  }, mapSelectionDelay);
}

function suppressMapSelectionBriefly(duration = 260) {
  suppressMapSelectionUntil = performance.now() + duration;
  cancelPendingMapSelection();
}

function isMapSelectionSuppressed() {
  return performance.now() < suppressMapSelectionUntil;
}

function createMapZoomControls() {
  const controls = document.createElement("div");
  controls.className = "map-zoom-controls";
  controls.setAttribute("aria-label", "Controles de zoom del mapa");
  controls.innerHTML = `
    <button type="button" data-map-zoom="in" aria-label="Acercar mapa">+</button>
    <button type="button" data-map-zoom="out" aria-label="Alejar mapa">-</button>
  `;

  controls.addEventListener("mousedown", (event) => event.stopPropagation());
  controls.addEventListener("pointerdown", (event) => event.stopPropagation());
  controls.addEventListener("dblclick", (event) => event.stopPropagation());
  controls.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
  controls.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scale = button.dataset.mapZoom === "in" ? 1.25 : 0.8;
      controls.parentElement?.mapGestures?.zoomBy(scale);
    });
  });

  return controls;
}

function enableMapGestures(container) {
  const svg = container.querySelector("svg");
  if (!svg) {
    return;
  }

  const baseViewBox = { x: 0, y: 0, width: mapWidth, height: mapHeight };
  const minScale = 1;
  const maxScale = window.innerWidth <= mobileBreakpoint ? 18 : 14;
  const horizontalPanPadding = window.innerWidth <= mobileBreakpoint ? 180 : 0;
  const dragThreshold = 6;
  const isMacWheelZoom = isMacDesktopPlatform();
  const wheelZoomStep = Math.log(1.15);
  const doubleTapDelay = 320;
  const doubleTapDistance = 28;
  const doubleTapZoomScale = 1.75;
  let viewBox = { ...baseViewBox };
  let suppressClick = false;
  let suppressClickTimer = null;
  let suppressClickPoint = null;
  let suppressClickUntil = 0;
  let mouseDrag = null;
  const touchPointers = new Map();
  let touchGesture = null;
  let lastTap = null;
  let viewBoxAnimation = null;
  const labelNodes = [...svg.querySelectorAll(".province-labels text")].map((label) => ({
    node: label,
    clickable: label.classList.contains("is-clickable"),
    fontSize: "",
    strokeWidth: "",
    opacity: "",
    pointerEvents: ""
  }));
  const siteNodes = [...svg.querySelectorAll(".geological-site")].map((site) => ({
    node: site,
    markerScale: "",
    hitScale: "",
    opacity: "",
    pointerEvents: ""
  }));
  const mobileMarkerScale = isMobileLikeViewport() ? 1.55 : 1;

  function applyViewBox() {
    svg.setAttribute(
      "viewBox",
      `${viewBox.x.toFixed(2)} ${viewBox.y.toFixed(2)} ${viewBox.width.toFixed(2)} ${viewBox.height.toFixed(2)}`
    );
    syncLabelScale();
  }

  function setViewBox(nextViewBox) {
    viewBox = { ...nextViewBox };
    clampViewBox();
    applyViewBox();
  }

  function syncLabelScale() {
    const ratio = viewBox.width / baseViewBox.width;
    const minRatio = 1 / maxScale;
    const zoomProgress = Math.max(0, Math.min(1, (1 - ratio) / (1 - minRatio)));
    const labelOpacity = zoomProgress <= 0.6
      ? 0
      : zoomProgress >= 0.75
        ? 1
        : (zoomProgress - 0.6) / 0.15;
    const isMobile = window.innerWidth <= mobileBreakpoint;
    const fontBase = isMobile ? mobileSummaryLabelFontSize : summaryLabelFontSize;
    const strokeBase = isMobile ? mobileSummaryLabelStrokeWidth : summaryLabelStrokeWidth;
    const fontSize = `${(fontBase * ratio).toFixed(1)}px`;
    const strokeWidth = `${(strokeBase * ratio).toFixed(1)}px`;
    const opacity = labelOpacity.toFixed(2);
    const pointerEvents = labelOpacity > 0 ? "auto" : "none";
    labelNodes.forEach((label) => {
      if (label.fontSize !== fontSize) {
        label.node.style.fontSize = fontSize;
        label.fontSize = fontSize;
      }
      if (label.strokeWidth !== strokeWidth) {
        label.node.style.strokeWidth = strokeWidth;
        label.strokeWidth = strokeWidth;
      }
      if (label.opacity !== opacity) {
        label.node.style.opacity = opacity;
        label.opacity = opacity;
      }
      if (label.clickable && label.pointerEvents !== pointerEvents) {
        label.node.style.pointerEvents = pointerEvents;
        label.pointerEvents = pointerEvents;
      }
    });

    const markerScale = (ratio * mobileMarkerScale).toFixed(2);
    const hitScale = ratio.toFixed(2);
    siteNodes.forEach((site) => {
      if (site.markerScale !== markerScale) {
        site.node.style.setProperty("--marker-scale", markerScale);
        site.markerScale = markerScale;
      }
      if (site.hitScale !== hitScale) {
        site.node.style.setProperty("--marker-hit-scale", hitScale);
        site.hitScale = hitScale;
      }
      if (site.opacity !== opacity) {
        site.node.style.opacity = opacity;
        site.opacity = opacity;
      }
      if (site.pointerEvents !== pointerEvents) {
        site.node.style.pointerEvents = pointerEvents;
        site.pointerEvents = pointerEvents;
      }
    });
  }

  function clampViewBox() {
    const minWidth = baseViewBox.width / maxScale;
    const minHeight = baseViewBox.height / maxScale;
    viewBox.width = Math.min(baseViewBox.width / minScale, Math.max(minWidth, viewBox.width));
      viewBox.height = Math.min(baseViewBox.height / minScale, Math.max(minHeight, viewBox.height));
    viewBox.x = Math.min(
      baseViewBox.x + baseViewBox.width - viewBox.width + horizontalPanPadding,
      Math.max(baseViewBox.x - horizontalPanPadding, viewBox.x)
    );
      viewBox.y = Math.min(baseViewBox.y + baseViewBox.height - viewBox.height, Math.max(baseViewBox.y, viewBox.y));
  }

  function touchPointerList() {
    return [...touchPointers.values()];
  }

  function distance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function midpoint(a, b) {
    return {
      clientX: (a.clientX + b.clientX) / 2,
      clientY: (a.clientY + b.clientY) / 2
    };
  }

  function svgViewportRect(box = viewBox) {
    const rect = svg.getBoundingClientRect();
    if (
      !rect.width ||
      !rect.height ||
      !Number.isFinite(box.width) ||
      !Number.isFinite(box.height)
    ) {
      return null;
    }

    const scale = Math.min(rect.width / box.width, rect.height / box.height);
    const width = box.width * scale;
    const height = box.height * scale;
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height
    };
  }

  function clientToSvg(point, box = viewBox) {
    const rect = svgViewportRect(box);
    if (
      !rect ||
      !rect.width ||
      !rect.height ||
      !Number.isFinite(point.clientX) ||
      !Number.isFinite(point.clientY) ||
      !Number.isFinite(box.x) ||
      !Number.isFinite(box.y) ||
      !Number.isFinite(box.width) ||
      !Number.isFinite(box.height)
    ) {
      return null;
    }

    return {
      x: box.x + ((point.clientX - rect.left) / rect.width) * box.width,
      y: box.y + ((point.clientY - rect.top) / rect.height) * box.height
    };
  }

  function handlePan(startPoint, point, startViewBox) {
    if (viewBoxAnimation) {
      cancelAnimationFrame(viewBoxAnimation);
      viewBoxAnimation = null;
    }

    const rect = svgViewportRect(startViewBox);
    if (!rect) {
      return;
    }

    const dx = ((point.clientX - startPoint.clientX) / rect.width) * startViewBox.width;
    const dy = ((point.clientY - startPoint.clientY) / rect.height) * startViewBox.height;
    viewBox = {
      ...startViewBox,
      x: startViewBox.x - dx,
      y: startViewBox.y - dy
    };
    clampViewBox();
    applyViewBox();
  }

  function animateToViewBox(target, duration = 360) {
    const start = { ...viewBox };
    const startedAt = performance.now();

    if (viewBoxAnimation) {
      cancelAnimationFrame(viewBoxAnimation);
    }

    const ease = (value) => 1 - Math.pow(1 - value, 3);
    const step = (now) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = ease(progress);
      setViewBox({
        x: start.x + (target.x - start.x) * eased,
        y: start.y + (target.y - start.y) * eased,
        width: start.width + (target.width - start.width) * eased,
        height: start.height + (target.height - start.height) * eased
      });
      if (progress < 1) {
        viewBoxAnimation = requestAnimationFrame(step);
      } else {
        viewBoxAnimation = null;
      }
    };

    viewBoxAnimation = requestAnimationFrame(step);
  }

  function suppressNextClickBriefly(point = null) {
    suppressClick = true;
    suppressClickPoint = point ? { clientX: point.clientX, clientY: point.clientY } : null;
    suppressClickUntil = performance.now() + 520;
    if (suppressClickTimer) {
      window.clearTimeout(suppressClickTimer);
    }
    suppressClickTimer = window.setTimeout(() => {
      suppressClick = false;
      suppressClickPoint = null;
      suppressClickUntil = 0;
      suppressClickTimer = null;
    }, 540);
  }

  function zoomBy(scale, centerPoint = null, options = {}) {
    if (!Number.isFinite(scale) || scale <= 0) {
      return;
    }
    if (viewBoxAnimation) {
      cancelAnimationFrame(viewBoxAnimation);
      viewBoxAnimation = null;
    }

    const minWidth = baseViewBox.width / maxScale;
    const maxWidth = baseViewBox.width / minScale;
    const isZoomingIn = scale > 1;
    const isZoomingOut = scale < 1;
    if ((isZoomingIn && viewBox.width <= minWidth) || (isZoomingOut && viewBox.width >= maxWidth)) {
      return;
    }

    const rect = svgViewportRect();
    if (!rect) {
      return;
    }

    const center = centerPoint || {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
    const point = clientToSvg(center);
    if (!point) {
      return;
    }

    const ratioX = (center.clientX - rect.left) / rect.width;
    const ratioY = (center.clientY - rect.top) / rect.height;
    const nextViewBox = {
      width: viewBox.width / scale,
      height: viewBox.height / scale,
      x: point.x - ratioX * (viewBox.width / scale),
      y: point.y - ratioY * (viewBox.height / scale)
    };
    if (
      !Number.isFinite(nextViewBox.x) ||
      !Number.isFinite(nextViewBox.y) ||
      !Number.isFinite(nextViewBox.width) ||
      !Number.isFinite(nextViewBox.height)
    ) {
      return;
    }

    if (options.animate) {
      animateToViewBox(nextViewBox, options.duration);
      return;
    }

    setViewBox(nextViewBox);
  }

  function beginTouchGesture() {
    const active = touchPointerList();
    if (active.length === 1) {
      touchGesture = {
        type: "pan",
        start: active[0],
        startViewBox: { ...viewBox }
      };
      return;
    }

    if (active.length >= 2) {
      const first = active[0];
      const second = active[1];
      const center = midpoint(first, second);
      const startCenterSvg = clientToSvg(center);
      if (!startCenterSvg) {
        return;
      }

      touchGesture = {
        type: "pinch",
        startDistance: distance(first, second),
        startCenterSvg,
        startViewBox: { ...viewBox }
      };
    }
  }

  function handlePinch(active) {
    if (viewBoxAnimation) {
      cancelAnimationFrame(viewBoxAnimation);
      viewBoxAnimation = null;
    }

    const first = active[0];
    const second = active[1];
    const nextDistance = distance(first, second);
    if (!nextDistance || !touchGesture?.startDistance) {
      return;
    }

    const rawScale = nextDistance / touchGesture.startDistance;
    const nextWidth = touchGesture.startViewBox.width / rawScale;
    const nextHeight = touchGesture.startViewBox.height / rawScale;
    const minWidth = baseViewBox.width / maxScale;
    const maxWidth = baseViewBox.width / minScale;
    const isZoomingIn = rawScale > 1;
    const isZoomingOut = rawScale < 1;
    if (
      (isZoomingIn && touchGesture.startViewBox.width <= minWidth) ||
      (isZoomingOut && touchGesture.startViewBox.width >= maxWidth)
    ) {
      return;
    }
    const center = midpoint(first, second);
    const rect = svgViewportRect(touchGesture.startViewBox);
    if (!rect) {
      return;
    }
    const centerRatioX = (center.clientX - rect.left) / rect.width;
    const centerRatioY = (center.clientY - rect.top) / rect.height;

    const nextViewBox = {
      width: nextWidth,
      height: nextHeight,
      x: touchGesture.startCenterSvg.x - centerRatioX * nextWidth,
      y: touchGesture.startCenterSvg.y - centerRatioY * nextHeight
    };
    if (
      !Number.isFinite(nextViewBox.x) ||
      !Number.isFinite(nextViewBox.y) ||
      !Number.isFinite(nextViewBox.width) ||
      !Number.isFinite(nextViewBox.height)
    ) {
      return;
    }
    viewBox = nextViewBox;
    clampViewBox();
    applyViewBox();
  }

  container.addEventListener("mousedown", (event) => {
    if (event.button !== 0 && event.button !== 2) {
      return;
    }

    suppressClick = false;
    if (event.button === 2) {
      event.preventDefault();
    }

    mouseDrag = {
      button: event.button,
      start: { clientX: event.clientX, clientY: event.clientY },
      startViewBox: { ...viewBox },
      moved: false
    };
  });

  window.addEventListener("mousemove", (event) => {
    if (!mouseDrag) {
      return;
    }

    const pointerDistance = Math.hypot(
      event.clientX - mouseDrag.start.clientX,
      event.clientY - mouseDrag.start.clientY
    );

    if (pointerDistance <= dragThreshold && !mouseDrag.moved) {
      return;
    }

    mouseDrag.moved = true;
    suppressClick = true;
    suppressMapSelectionBriefly();
    handlePan(mouseDrag.start, { clientX: event.clientX, clientY: event.clientY }, mouseDrag.startViewBox);
  });

  window.addEventListener("mouseup", () => {
    if (mouseDrag?.moved) {
      suppressMapSelectionBriefly();
    }
    mouseDrag = null;
  });

  container.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") {
      return;
    }

    event.preventDefault();
    touchPointers.set(event.pointerId, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startedAt: performance.now(),
      moved: false
    });
    container.setPointerCapture?.(event.pointerId);
    beginTouchGesture();
  });

  container.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || !touchPointers.has(event.pointerId) || !touchGesture) {
      return;
    }

    event.preventDefault();
    const activePointer = touchPointers.get(event.pointerId);
    touchPointers.set(event.pointerId, {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      startClientX: activePointer.startClientX,
      startClientY: activePointer.startClientY,
      startedAt: activePointer.startedAt,
      moved: activePointer.moved || Math.hypot(
        event.clientX - activePointer.startClientX,
        event.clientY - activePointer.startClientY
      ) > dragThreshold
    });

    const active = touchPointerList();
    if (touchGesture.type === "pan" && active.length === 1) {
      handlePan(touchGesture.start, active[0], touchGesture.startViewBox);
    } else if (active.length >= 2) {
      if (touchGesture.type !== "pinch") {
        beginTouchGesture();
      }
      handlePinch(active);
    }
  });

  function endPointer(event) {
    const endedPointer = touchPointers.get(event.pointerId);
    const isTap = endedPointer
      && touchPointers.size === 1
      && !endedPointer.moved
      && Math.hypot(
        event.clientX - endedPointer.startClientX,
        event.clientY - endedPointer.startClientY
      ) <= dragThreshold;

    if (isTap) {
      const now = performance.now();
      const isDoubleTap = lastTap
        && now - lastTap.time <= doubleTapDelay
        && Math.hypot(event.clientX - lastTap.clientX, event.clientY - lastTap.clientY) <= doubleTapDistance;

      if (isDoubleTap) {
        event.preventDefault();
        event.stopPropagation();
        cancelPendingMapSelection();
        suppressNextClickBriefly(event);
        zoomBy(doubleTapZoomScale, event, { animate: true });
        lastTap = null;
      } else {
        lastTap = {
          time: now,
          clientX: event.clientX,
          clientY: event.clientY
        };
      }
    } else {
      lastTap = null;
    }

    touchPointers.delete(event.pointerId);
    if (touchPointers.size) {
      beginTouchGesture();
    } else {
      touchGesture = null;
    }
  }

  container.addEventListener("pointerup", endPointer);
  container.addEventListener("pointercancel", endPointer);
  container.addEventListener("click", (event) => {
    if (isMapSelectionSuppressed()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const shouldSuppressClick = suppressClick
      && performance.now() <= suppressClickUntil
      && (!suppressClickPoint || Math.hypot(
        event.clientX - suppressClickPoint.clientX,
        event.clientY - suppressClickPoint.clientY
      ) <= doubleTapDistance * 1.5);

    if (shouldSuppressClick) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  container.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  container.addEventListener("dblclick", (event) => {
    event.preventDefault();
    event.stopPropagation();
    cancelPendingMapSelection();
    suppressNextClickBriefly(event);
    zoomBy(doubleTapZoomScale, event, { animate: true });
  });
  container.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (viewBoxAnimation) {
      cancelAnimationFrame(viewBoxAnimation);
      viewBoxAnimation = null;
    }

    const deltaX = wheelDeltaPixels(event, "X");
    const deltaY = wheelDeltaPixels(event, "Y");
    if (!deltaX && !deltaY) {
      return;
    }

    if (isMacWheelZoom && isTrackpadPanWheel(event, deltaX, deltaY)) {
      const rect = svgViewportRect();
      if (!rect) {
        return;
      }
      viewBox = {
        ...viewBox,
        x: viewBox.x + (deltaX / rect.width) * viewBox.width,
        y: viewBox.y + (deltaY / rect.height) * viewBox.height
      };
      clampViewBox();
      applyViewBox();
      return;
    }

    const isZoomingIn = deltaY < 0;
    const sensitivity = isMacWheelZoom ? (event.ctrlKey ? 0.85 : 0.58) : 1;
    const zoomUnits = Math.min(Math.abs(deltaY) / 100, isMacWheelZoom ? 1.25 : 2);
    const scale = Math.exp((isZoomingIn ? 1 : -1) * wheelZoomStep * zoomUnits * sensitivity);
    zoomBy(scale, event);
  }, { passive: false });

  container.mapGestures = {
    zoomBy,
    flyToBounds(bounds, options = {}) {
      if (!bounds) {
        return;
      }

      const padding = options.padding ?? (window.innerWidth <= mobileBreakpoint ? 24 : 38);
      const duration = options.duration ?? 650;
      const boundsWidth = Math.max(1, bounds.maxX - bounds.minX);
      const boundsHeight = Math.max(1, bounds.maxY - bounds.minY);
      let targetWidth = Math.min(
        baseViewBox.width,
        Math.max(boundsWidth + padding * 2, baseViewBox.width / (window.innerWidth <= mobileBreakpoint ? 6.2 : 7.2))
      );
      let targetHeight = Math.min(
        baseViewBox.height,
        Math.max(boundsHeight + padding * 2, baseViewBox.height / (window.innerWidth <= mobileBreakpoint ? 6.2 : 7.2))
      );
      const isMobileGameFlyTo = window.innerWidth <= mobileBreakpoint && state.playMode === "game";
      const visibleMargin = options.visibleMargin ?? (isMobileGameFlyTo ? 0.15 : null);
      let visibleFrameHeight = targetHeight;
      if (visibleMargin !== null) {
        const mapRect = container.getBoundingClientRect();
        const gameCard = document.querySelector(".game-layout .game-card");
        const panelRect = gameCard?.getBoundingClientRect();
        const occludedHeightPx = panelRect && mapRect.height > 0 && panelRect.top < mapRect.bottom
          ? Math.max(0, mapRect.bottom - panelRect.top)
          : 0;
        const visibleHeightRatio = mapRect.height > 0
          ? Math.max(0.35, Math.min(1, (mapRect.height - occludedHeightPx) / mapRect.height))
          : 1;
        const contentRatio = Math.max(0.1, 1 - visibleMargin * 2);

        targetWidth = Math.min(baseViewBox.width, Math.max(boundsWidth / contentRatio, baseViewBox.width / maxScale));
        visibleFrameHeight = Math.min(baseViewBox.height, Math.max(boundsHeight / contentRatio, baseViewBox.height / maxScale));
        targetHeight = Math.min(baseViewBox.height, visibleFrameHeight / visibleHeightRatio);
      }
      const target = {
        width: targetWidth,
        height: targetHeight,
        x: (bounds.minX + bounds.maxX) / 2 - targetWidth / 2,
        y: (bounds.minY + bounds.maxY) / 2 - (visibleMargin !== null ? visibleFrameHeight : targetHeight) / 2
      };
      if (isMobileLikeViewport() && state.playMode === "game" && visibleMargin === null) {
        const mapRect = container.getBoundingClientRect();
        const gameCard = document.querySelector(".game-layout .game-card");
        const panelRect = gameCard?.getBoundingClientRect();
        if (panelRect && mapRect.height > 0 && panelRect.top < mapRect.bottom) {
          const occludedHeightPx = Math.max(0, mapRect.bottom - panelRect.top);
          if (occludedHeightPx > 0) {
            const scaleAtTarget = Math.min(mapRect.width / target.width, mapRect.height / target.height);
            if (Number.isFinite(scaleAtTarget) && scaleAtTarget > 0) {
              const shiftUpInSvg = (occludedHeightPx * 0.5) / scaleAtTarget;
              target.y += shiftUpInSvg;
            }
          }
        }
      }
      const start = { ...viewBox };
      const startedAt = performance.now();

      if (viewBoxAnimation) {
        cancelAnimationFrame(viewBoxAnimation);
      }

      const ease = (value) => 1 - Math.pow(1 - value, 3);
      const step = (now) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = ease(progress);
        setViewBox({
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
          width: start.width + (target.width - start.width) * eased,
          height: start.height + (target.height - start.height) * eased
        });
        if (progress < 1) {
          viewBoxAnimation = requestAnimationFrame(step);
        } else {
          viewBoxAnimation = null;
        }
      };

      viewBoxAnimation = requestAnimationFrame(step);
    }
  };

  syncLabelScale();
}

function legalLinks(className = "") {
  return `
    <nav class="site-footer-links ${className}" aria-label="Informacion legal">
      <a class="github-repo-link" href="https://github.com/efrencd/geolearn_canarias" target="_blank" rel="noreferrer" aria-label="Repositorio en GitHub" title="Repositorio en GitHub">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.11.79-.25.79-.56v-2.16c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18A10.94 10.94 0 0 1 12 6.07c.98 0 1.96.13 2.88.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.42-2.69 5.39-5.25 5.67.42.36.78 1.06.78 2.14v3.16c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>
        </svg>
        <span class="sr-only">GitHub</span>
      </a>
      <a href="/fuentes">Fuentes</a>
      <a href="/privacidad">Privacidad</a>
      <a href="/aviso-legal">Aviso legal</a>
    </nav>
  `;
}

function header(active) {
  const showPlayModeSwitch = active !== "teacher";
  const showIslandFilter = showPlayModeSwitch && state.playMode === "game";
  return `
    <button class="mobile-menu-toggle" type="button" data-menu-toggle aria-controls="mobileMenu" aria-expanded="false" aria-label="Abrir menu">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <div class="mobile-menu-backdrop" data-menu-close></div>
    <header id="mobileMenu" class="topbar ${active === "teacher" ? "is-teacher" : ""}" aria-label="Menu principal">
      <h1>GeoLearn Canarias</h1>
      <div class="topbar-actions">
        <button class="teacher-toggle ${active === "teacher" ? "is-active" : ""}" data-view="${active === "teacher" ? "student" : "teacher"}" aria-label="Profesor" title="Profesor">
          ${teacherIcon()}
          <span>Acceso profesorado</span>
        </button>
        ${showPlayModeSwitch ? `
          <nav class="mode-switch" aria-label="Modo de uso">
            <button class="${state.playMode === "game" ? "is-active" : ""}" data-play-mode="game">
              ${gamepadIcon()}
              <span>Juego</span>
            </button>
            <button class="${state.playMode === "learn" ? "is-active" : ""}" data-play-mode="learn">
              ${learningIcon()}
              <span>Aprendizaje</span>
            </button>
          </nav>
          ${showIslandFilter ? `
            <label class="game-select-filter" for="islandFilterSelect">
              <select id="islandFilterSelect" data-island-filter>
                <option value="ALL" ${state.selectedIslandFilter === "ALL" ? "selected" : ""}>Todas las islas</option>
                ${islandFilters().map((island) => `<option value="${escapeHtml(island)}" ${state.selectedIslandFilter === island ? "selected" : ""}>${escapeHtml(island)}</option>`).join("")}
              </select>
            </label>
            <label class="game-select-filter" for="contentFilterSelect">
              <select id="contentFilterSelect" data-content-filter>
                <option value="municipalities" ${state.selectedContentFilter === "municipalities" ? "selected" : ""}>Municipios</option>
                <option value="geological" ${state.selectedContentFilter === "geological" ? "selected" : ""}>Puntos geologicos</option>
                <option value="both" ${state.selectedContentFilter === "both" ? "selected" : ""}>Municipios y puntos</option>
              </select>
            </label>
            <button class="start-round-button" type="button" data-start-round>Comenzar ronda</button>
          ` : ""}
        ` : ""}
        ${active === "teacher" ? `
          <button class="back-toggle" data-view="student" aria-label="Volver al modo normal" title="Volver al modo normal">
            ${backIcon()}
            <span>Volver</span>
          </button>
          <p class="teacher-sidebar-description">Gestiona tus clases, crea alumnado y revisa su progreso desde un panel privado de profesorado.</p>
        ` : ""}
      </div>
      ${legalLinks("legal-links-menu")}
    </header>
  `;
}

function wireTabs() {
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const menuBackdrop = document.querySelector("[data-menu-close]");
  const topbar = document.querySelector(".topbar");
  syncMobileMenuForViewport();

  menuToggle?.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("is-mobile-menu-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  });
  menuBackdrop?.addEventListener("click", closeMobileMenu);
  topbar?.addEventListener("click", (event) => {
    if (event.target.closest("[data-view]")) {
      closeMobileMenu();
    }
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.view;
      render();
    });
  });
  document.querySelectorAll("[data-play-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.playMode = button.dataset.playMode;
      if (state.playMode === "game") {
        state.gameRoundStarted = false;
      }
      render();
    });
  });
  document.querySelectorAll("[data-island-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      state.selectedIslandFilter = select.value || "ALL";
      state.gameRoundStarted = false;
      if (state.mode === "student" && state.playMode === "game") {
        renderGame();
      }
    });
  });
  document.querySelectorAll("[data-content-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      state.selectedContentFilter = select.value || "municipalities";
      state.gameRoundStarted = false;
      if (state.mode === "student" && state.playMode === "game") {
        renderGame();
      }
    });
  });
  document.querySelectorAll("[data-start-round]").forEach((button) => {
    button.addEventListener("click", () => {
      state.gameRoundStarted = true;
      state.roundNumber = 1;
      closeMobileMenu();
      renderGame();
    });
  });

  syncDynamicTopbarHeight();
  window.setTimeout(syncDynamicTopbarHeight, 0);
}

function createMapLogoOverlay() {
  const logo = document.createElement("img");
  logo.className = "map-logo-overlay";
  logo.src = "/assets/logo-geolearn-canarias.svg?v=canarias-32";
  logo.alt = "GeoLearn Canarias";
  logo.loading = "eager";
  logo.decoding = "async";
  return logo;
}

function inClassroomMode() {
  return Boolean(state.classCode);
}

function renderStudentLogin(message = "") {
  appRoot.innerHTML = `
    ${header("student")}
    <section class="login-grid">
      <form id="studentLoginForm" class="panel login-panel">
        <h2>Acceso del alumno</h2>
        ${state.classroom ? `<p class="classroom-banner">Clase: <strong>${state.classroom.name}</strong> · Codigo ${state.classroom.class_code}</p>` : ""}
        <label>Usuario <input name="username" autocomplete="username" required /></label>
        <label>PIN <input name="pin" inputmode="numeric" autocomplete="one-time-code" required /></label>
        <button class="primary" type="submit">Entrar a la clase</button>
        <p class="form-message">${message}</p>
      </form>
    </section>
  `;
  wireTabs();
  document.querySelector("#studentLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api("/api/student/login", {
        method: "POST",
        body: {
          username: form.get("username"),
          pin: form.get("pin"),
          classCode: state.classCode
        }
      });
      state.studentToken = result.token;
      state.student = result.student;
      localStorage.setItem("studentToken", result.token);
      state.score = 0;
      state.attempts = 0;
      state.roundScore = 0;
      state.roundNumber = 1;
      renderGame();
    } catch (error) {
      renderStudentLogin(error.message);
    }
  });
}

function chooseTarget() {
  document.querySelectorAll(".is-correct,.is-wrong,.is-expected").forEach((node) => {
    node.classList.remove("is-correct", "is-wrong", "is-expected");
  });
  state.currentTarget = state.roundQueue[state.questionNumber] || null;
  flyToCurrentTargetIsland();
}

function targetIslandFeatures() {
  if (!state.currentTarget) {
    return [];
  }

  const island = targetIsland(state.currentTarget);
  return state.features.filter((feature) => islandName(feature) === island);
}

function flyToCurrentTargetIsland() {
  const mapMount = document.querySelector("#mapMount");
  if (!mapMount?.mapGestures || !state.currentTarget) {
    return;
  }

  const bounds = targetBounds(state.currentTarget) || projectedFeatureBounds(targetIslandFeatures());
  mapMount.mapGestures.flyToBounds(bounds);
}

function updateGameHud(message = "") {
  document.querySelector(".game-card")?.classList.toggle("is-round-complete", state.roundComplete);
  if (!state.gameRoundStarted) {
    document.querySelector("#targetName").textContent = "Prepara la ronda";
    document.querySelector("#targetIsland").textContent = contentFilterLabel();
    const targetKind = document.querySelector("#targetKind");
    if (targetKind) {
      targetKind.textContent = "Juego";
    }
    document.querySelector("#scoreText").textContent = "0";
    document.querySelector("#roundText").textContent = `0/${roundSize}`;
    const progressCurrent = document.querySelector("#progressCurrent");
    if (progressCurrent) {
      progressCurrent.textContent = "0";
    }
    const progressTotal = document.querySelector("#progressTotal");
    if (progressTotal) {
      progressTotal.textContent = String(roundSize);
    }
    const progressPercentNode = document.querySelector("#progressPercent");
    if (progressPercentNode) {
      progressPercentNode.textContent = "0%";
    }
    const progressFill = document.querySelector("#progressFill");
    if (progressFill) {
      progressFill.style.width = "0%";
    }
    document.querySelector("#gameMessage").textContent = "";
    return;
  }
  const currentQuestion = state.roundLimit > 0 ? Math.min(state.questionNumber + 1, state.roundLimit) : 0;
  const progressPercent = state.roundLimit > 0 ? Math.round((currentQuestion / state.roundLimit) * 100) : 0;
  document.querySelector("#targetName").textContent = state.currentTarget
    ? targetName(state.currentTarget)
    : "Ronda completada";
  document.querySelector("#targetIsland").textContent = state.currentTarget
    ? targetIsland(state.currentTarget)
    : "";
  const targetKind = document.querySelector("#targetKind");
  if (targetKind) {
    targetKind.textContent = state.currentTarget ? targetKindLabel(state.currentTarget) : contentFilterLabel();
  }
  document.querySelector("#scoreText").textContent = state.roundScore;
  document.querySelector("#roundText").textContent = `${currentQuestion}/${state.roundLimit}`;
  const progressCurrent = document.querySelector("#progressCurrent");
  if (progressCurrent) {
    progressCurrent.textContent = String(currentQuestion);
  }
  const progressTotal = document.querySelector("#progressTotal");
  if (progressTotal) {
    progressTotal.textContent = String(state.roundLimit);
  }
  const progressPercentNode = document.querySelector("#progressPercent");
  if (progressPercentNode) {
    progressPercentNode.textContent = `${progressPercent}%`;
  }
  const progressFill = document.querySelector("#progressFill");
  if (progressFill) {
    progressFill.style.width = `${progressPercent}%`;
  }
  document.querySelector("#gameMessage").textContent = message;
}

async function recordAttempt(target, correct) {
  if (!state.studentToken) {
    return;
  }

  await api("/api/attempts", {
    method: "POST",
    token: state.studentToken,
    body: {
      provinceCode: targetRecordCode(target),
      provinceName: targetName(target),
      correct
    }
  });
}

function finishPick(correct, pickedGroup, expectedSelector, wrongMessage) {
  if (state.locked || !state.currentTarget) {
    return false;
  }

  state.locked = true;
  const targetKey = targetResultKey(state.currentTarget);
  state.attempts += 1;
  state.roundResults[targetKey] = correct;

  if (correct) {
    state.score += 1;
    state.roundScore += 1;
    pickedGroup?.classList.add("is-correct");
  } else {
    pickedGroup?.classList.add("is-wrong");
    const expected = document.querySelector(expectedSelector);
    expected?.classList.add("is-expected");
  }

  updateGameHud(correct ? "Correcto" : wrongMessage);
  recordAttempt(state.currentTarget, correct).catch(() => {});

  window.setTimeout(() => {
    document.querySelectorAll(".is-correct,.is-wrong,.is-expected").forEach((node) => {
      node.classList.remove("is-correct", "is-wrong", "is-expected");
    });
    state.questionNumber += 1;
    if (state.questionNumber >= state.roundLimit) {
      state.roundComplete = true;
      state.currentTarget = null;
      state.locked = false;
      showRoundSummaryMap();
      updateGameHud(`Ronda terminada: ${state.roundScore} de ${state.roundLimit}`);
      return;
    }

    chooseTarget();
    state.locked = false;
    updateGameHud();
  }, 1400);
  return true;
}

async function handleMunicipalityPick(feature, group) {
  if (state.locked || !state.currentTarget) {
    return;
  }
  if (isGeologicalTarget(state.currentTarget)) {
    return;
  }

  const correct = municipalityCode(feature) === municipalityCode(state.currentTarget);
  const expectedSelector = `[data-code="${CSS.escape(municipalityCode(state.currentTarget))}"]`;
  finishPick(correct, group, expectedSelector, `Era ${targetName(state.currentTarget)}`);
}

async function handleGeologicalSitePick(site, group) {
  if (state.locked || !state.currentTarget) {
    return;
  }

  const correct = isGeologicalTarget(state.currentTarget) && siteId(site) === siteId(state.currentTarget);
  const expectedSelector = isGeologicalTarget(state.currentTarget)
    ? `[data-site-id="${CSS.escape(siteId(state.currentTarget))}"]`
    : `[data-code="${CSS.escape(municipalityCode(state.currentTarget))}"]`;
  finishPick(correct, group, expectedSelector, `Era ${targetName(state.currentTarget)}`);
}

function showRoundSummaryMap() {
  const mount = document.querySelector("#mapMount");
  mount.replaceChildren(createMap(null, {
    showLabels: true,
    showGeologicalSites: state.selectedContentFilter !== "municipalities",
    results: state.roundResults
  }));
  mount.append(createMapLogoOverlay());
  enableMapGestures(mount);
}

function municipalityInfo(featureOrCode) {
  const code = typeof featureOrCode === "string" ? featureOrCode : municipalityCode(featureOrCode);
  return state.municipalityInfo[code] || null;
}

function geologicalSiteInfo(siteOrId) {
  const id = typeof siteOrId === "string" ? siteOrId : siteId(siteOrId);
  return state.geologicalSites.find((site) => siteId(site) === id) || null;
}

function formatPopulation(value) {
  return value ? new Intl.NumberFormat("es-ES").format(value) : "Dato no disponible";
}

function wikipediaQueries(info) {
  const name = info?.name || "";
  const island = info?.island || "";
  if (info?.targetType === "geological") {
    return [
      `${name} ${island} Canarias`,
      `${name} Canarias`,
      `${name} ${island}`,
      name
    ].filter(Boolean);
  }
  return [
    `${name} municipio Canarias`,
    `${name} ${island}`,
    name
  ].filter(Boolean);
}

function normalizeWikipediaText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wikipediaCandidateScore(info, page) {
  const municipality = normalizeWikipediaText(info?.name);
  const island = normalizeWikipediaText(info?.island);
  const isGeological = info?.targetType === "geological";
  const title = normalizeWikipediaText(page?.title);
  const key = normalizeWikipediaText(page?.key);
  const description = normalizeWikipediaText(page?.description);
  const haystack = `${title} ${key} ${description}`.trim();
  let score = 0;

  if (title === municipality || key === municipality) {
    score += 120;
  } else if (municipality && haystack.includes(municipality)) {
    score += 40;
  }

  if (isGeological) {
    if (description.includes("volcan") || description.includes("geolog") || description.includes("montana") || description.includes("roque") || description.includes("caldera")) {
      score += 35;
    }
    if (description.includes("municipio") || title.includes("(municipio)")) {
      score -= 120;
    }
  } else {
    if (description.includes("municipio")) {
      score += 45;
    }
    if (title.includes("(municipio)")) {
      score += 35;
    }
  }
  if (island && haystack.includes(island)) {
    score += 20;
  }

  if (description.includes("provincia")) {
    score -= 120;
  }
  if (title.startsWith(`provincia de ${municipality}`) || key.startsWith(`provincia de ${municipality}`)) {
    score -= 220;
  }
  if (title.includes("(provincia)")) {
    score -= 160;
  }

  return score;
}

function pickWikipediaPage(info, pages = []) {
  if (!pages.length) {
    return null;
  }

  let bestPage = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const page of pages) {
    const score = wikipediaCandidateScore(info, page);
    if (score > bestScore) {
      bestScore = score;
      bestPage = page;
    }
  }
  return bestPage;
}

async function fetchWikipediaInfo(info) {
  const code = info.wikipediaKey || info.code || info.id || info.name;
  if (state.wikipediaInfo[code]) {
    return state.wikipediaInfo[code];
  }

  const pending = { status: "loading" };
  state.wikipediaInfo[code] = pending;

  try {
    let page = null;
    if (info.wikipediaTitle) {
      page = {
        title: info.wikipediaTitle,
        key: info.wikipediaTitle.replace(/\s+/g, "_")
      };
    }
    for (const query of page ? [] : wikipediaQueries(info)) {
      const searchUrl = new URL("https://es.wikipedia.org/w/rest.php/v1/search/page");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("limit", "8");
      const searchResponse = await fetch(searchUrl, {
        headers: { Accept: "application/json" }
      });
      if (!searchResponse.ok) {
        continue;
      }
      const searchData = await searchResponse.json();
      page = pickWikipediaPage(info, searchData.pages || []);
      if (page?.key) {
        break;
      }
    }

    if (!page?.key) {
      throw new Error("Sin articulo");
    }

    const summaryUrl = new URL("https://es.wikipedia.org/w/api.php");
    summaryUrl.searchParams.set("action", "query");
    summaryUrl.searchParams.set("format", "json");
    summaryUrl.searchParams.set("origin", "*");
    summaryUrl.searchParams.set("prop", "extracts|pageimages");
    summaryUrl.searchParams.set("explaintext", "1");
    summaryUrl.searchParams.set("exchars", "1400");
    summaryUrl.searchParams.set("piprop", "thumbnail");
    summaryUrl.searchParams.set("pithumbsize", "640");
    summaryUrl.searchParams.set("redirects", "1");
    summaryUrl.searchParams.set("titles", page.title || page.key);
    const summaryResponse = await fetch(summaryUrl, {
      headers: { Accept: "application/json" }
    });
    if (!summaryResponse.ok) {
      throw new Error("Sin resumen");
    }

    const summary = await summaryResponse.json();
    const summaryPage = Object.values(summary.query?.pages || {})[0] || {};
    const result = {
      status: "ready",
      title: summaryPage.title || page.title || info.name,
      extract: summaryPage.extract || "",
      url: `https://es.wikipedia.org/wiki/${encodeURIComponent(page.key)}`,
      thumbnail: summaryPage.thumbnail?.source || ""
    };
    state.wikipediaInfo[code] = result;
    return result;
  } catch {
    const result = { status: "error" };
    state.wikipediaInfo[code] = result;
    return result;
  }
}

async function fetchMunicipalityNews(info) {
  const code = info.code || info.name;
  if (state.newsInfo[code]) {
    return state.newsInfo[code];
  }

  const pending = { status: "loading", articles: [] };
  state.newsInfo[code] = pending;

  try {
    const newsUrl = new URL("/api/news", window.location.origin);
    newsUrl.searchParams.set("municipality", info.name);
    newsUrl.searchParams.set("island", info.island || "");
    const response = await fetch(newsUrl, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error("Sin noticias");
    }

    const result = await response.json();
    const ready = {
      status: "ready",
      articles: Array.isArray(result.articles) ? result.articles.slice(0, 6) : []
    };
    state.newsInfo[code] = ready;
    return ready;
  } catch {
    const result = { status: "error", articles: [] };
    state.newsInfo[code] = result;
    return result;
  }
}

function renderWikipediaBlock(info) {
  const wikipedia = state.wikipediaInfo[info.wikipediaKey || info.code || info.id || info.name] || { status: "idle" };
  if (wikipedia.status === "ready") {
    return `
      <section class="wikipedia-summary">
        <h4>Wikipedia</h4>
        ${wikipedia.thumbnail ? `<img class="wikipedia-thumb" src="${escapeHtml(wikipedia.thumbnail)}" alt="" loading="lazy" />` : ""}
        ${formatWikipediaExtract(wikipedia.extract)}
        <a href="${escapeHtml(wikipedia.url)}" target="_blank" rel="noreferrer">Leer articulo completo</a>
      </section>
    `;
  }

  if (wikipedia.status === "error") {
    const fallbackText = info.targetType === "geological"
      ? "No hay resumen disponible para este punto geologico."
      : "No hay resumen disponible para este municipio.";
    return `
      <section class="wikipedia-summary">
        <h4>Wikipedia</h4>
        <p>${fallbackText}</p>
      </section>
    `;
  }

  return `
    <section class="wikipedia-summary">
      <h4>Wikipedia</h4>
      <p>Cargando resumen...</p>
    </section>
  `;
}

function renderNewsBlock(info) {
  const news = state.newsInfo[info.code || info.id || info.name] || { status: "idle", articles: [] };
  if (news.status === "ready") {
    if (!news.articles.length) {
      return `
        <section class="news-summary">
          <p>No se han encontrado noticias recientes para este municipio.</p>
        </section>
      `;
    }

    return `
      <section class="news-summary">
        ${news.articles.map((article) => `
          <article class="news-item">
            <a href="${escapeHtml(article.link)}" target="_blank" rel="noreferrer">${escapeHtml(article.title)}</a>
            <p>
              ${article.source ? `<span>${escapeHtml(article.source)}</span>` : ""}
              ${article.publishedAt ? `<time datetime="${escapeHtml(article.publishedAt)}">${escapeHtml(formatNewsDate(article.publishedAt))}</time>` : ""}
            </p>
          </article>
        `).join("")}
      </section>
    `;
  }

  if (news.status === "error") {
    return `
      <section class="news-summary">
        <p>No se han podido cargar noticias recientes.</p>
      </section>
    `;
  }

  return `
    <section class="news-summary">
      <p>Cargando noticias recientes...</p>
    </section>
  `;
}

function renderMunicipalityTabs(info) {
  const activeTab = state.municipalityInfoTab === "news" ? "news" : "wikipedia";
  return `
    <div class="municipality-info-tabs" role="tablist" aria-label="Informacion ampliada">
      <button type="button" role="tab" data-info-tab="wikipedia" aria-selected="${activeTab === "wikipedia"}" class="${activeTab === "wikipedia" ? "is-active" : ""}">Wikipedia</button>
      <button type="button" role="tab" data-info-tab="news" aria-selected="${activeTab === "news"}" class="${activeTab === "news" ? "is-active" : ""}">Noticias</button>
    </div>
    <div class="municipality-info-tab-panel">
      ${activeTab === "news" ? renderNewsBlock(info) : renderWikipediaBlock(info)}
    </div>
  `;
}

function renderMunicipalityInfo() {
  const panel = document.querySelector("#municipalityInfo");
  if (!panel) {
    return;
  }

  if (!state.selectedMunicipalityCode && !state.selectedGeologicalSiteId) {
    panel.innerHTML = `
      <div class="municipality-info-empty">
        <h3>Informacion del mapa</h3>
        <p>Pulsa un municipio, un nombre o una estrella del mapa para ver sus detalles.</p>
      </div>
    `;
    return;
  }

  const site = state.selectedGeologicalSiteId ? geologicalSiteInfo(state.selectedGeologicalSiteId) : null;
  if (site) {
    const siteInfo = { ...site, targetType: "geological", wikipediaKey: `geo:${site.id}` };
    panel.innerHTML = `
      <div class="municipality-info-card geological-info-card">
        <div class="municipality-info-head">
          <div>
            <p class="municipality-info-eyebrow">${escapeHtml(site.island)} · Punto geologico</p>
            <h3>${escapeHtml(site.name)}</h3>
          </div>
        </div>
        <div class="municipality-info-tab-panel">
          ${renderWikipediaBlock(siteInfo)}
        </div>
      </div>
    `;
    if (!state.wikipediaInfo[siteInfo.wikipediaKey]) {
      fetchWikipediaInfo(siteInfo).then(() => {
        if (state.selectedGeologicalSiteId === site.id) {
          renderMunicipalityInfo();
        }
      });
    }
    return;
  }

  const info = municipalityInfo(state.selectedMunicipalityCode);
  if (!info) {
    panel.innerHTML = `
      <div class="municipality-info-empty">
        <h3>Informacion del municipio</h3>
        <p>No hay datos disponibles para este municipio.</p>
      </div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="municipality-info-card">
      <div class="municipality-info-head">
        <div>
          <p class="municipality-info-eyebrow">${info.island}</p>
          <h3>${info.name}</h3>
        </div>
      </div>
      <div class="municipality-info-grid">
        <div>
          <p class="info-chip-title"><span class="info-chip-icon">${peopleIcon()}</span><span>Habitantes</span></p>
          <strong>${formatPopulation(info.population)}</strong>
        </div>
        <div>
          <p class="info-chip-title"><span class="info-chip-icon">${globeIcon()}</span><span>Ayuntamiento</span></p>
          ${info.website ? `<a href="${info.website}" target="_blank" rel="noreferrer">Abrir web</a>` : `<strong>Dato no disponible</strong>`}
        </div>
      </div>
      ${renderMunicipalityTabs(info)}
    </div>
  `;

  panel.querySelectorAll("[data-info-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.municipalityInfoTab = button.dataset.infoTab;
      renderMunicipalityInfo();
    });
  });

  if (!state.wikipediaInfo[info.code]) {
    fetchWikipediaInfo(info).then(() => {
      if (state.selectedMunicipalityCode === info.code) {
        renderMunicipalityInfo();
      }
    });
  }

  if (state.municipalityInfoTab === "news" && !state.newsInfo[info.code]) {
    fetchMunicipalityNews(info).then(() => {
      if (state.selectedMunicipalityCode === info.code && state.municipalityInfoTab === "news") {
        renderMunicipalityInfo();
      }
    });
  }

}

function syncSelectedMunicipality() {
  document.querySelectorAll(".province").forEach((group) => {
    group.classList.toggle("is-info-selected", group.dataset.code === state.selectedMunicipalityCode);
  });
  document.querySelectorAll(".geological-site").forEach((group) => {
    group.classList.toggle("is-info-selected", group.dataset.siteId === state.selectedGeologicalSiteId);
  });
  document.querySelectorAll(".province-labels text").forEach((label) => {
    label.classList.toggle("is-selected", label.textContent === municipalityInfo(state.selectedMunicipalityCode)?.name);
  });
}

function selectMunicipalityInfo(feature) {
  state.selectedMunicipalityCode = municipalityCode(feature);
  state.selectedGeologicalSiteId = "";
  state.municipalityInfoTab = "wikipedia";
  renderMunicipalityInfo();
  syncSelectedMunicipality();
}

function selectGeologicalSiteInfo(site) {
  state.selectedMunicipalityCode = "";
  state.selectedGeologicalSiteId = siteId(site);
  state.municipalityInfoTab = "wikipedia";
  renderMunicipalityInfo();
  syncSelectedMunicipality();
}

function closeMunicipalityInfoPanel() {
  if (!state.selectedMunicipalityCode && !state.selectedGeologicalSiteId) {
    return;
  }
  state.selectedMunicipalityCode = "";
  state.selectedGeologicalSiteId = "";
  state.municipalityInfoTab = "wikipedia";
  renderMunicipalityInfo();
  syncSelectedMunicipality();
}

function wireLearningInfoSheet(mapMount) {
  const learningCard = document.querySelector(".learning-card");
  if (!learningCard) {
    return;
  }

  const dragState = {
    pointerId: null,
    startY: 0,
    currentY: 0,
    dragging: false,
    hasMoved: false
  };

  const isPhoneLandscapeLayout = () => window.matchMedia("(max-width: 1100px) and (orientation: landscape)").matches;
  const isBottomSheetLayout = () => window.innerWidth <= 1100 && !isPhoneLandscapeLayout();
  const sheetTransform = (deltaY = 0) => (
    isBottomSheetLayout()
      ? `translateX(-50%) translateY(${deltaY}px)`
      : `translateY(${deltaY}px)`
  );
  const restingTransform = () => sheetTransform(0);

  const resetSheetPosition = () => {
    learningCard.style.transition = "transform 180ms ease";
    learningCard.style.transform = restingTransform();
    window.setTimeout(() => {
      learningCard.style.transition = "";
    }, 190);
  };

  const closeSheetTransform = () => {
    const panelHeight = learningCard.getBoundingClientRect().height;
    const translateY = Math.ceil(panelHeight + 24);
    return sheetTransform(translateY);
  };

  const isInDragHandle = (clientY) => {
    const cardRect = learningCard.getBoundingClientRect();
    const headRect = learningCard.querySelector(".municipality-info-head")?.getBoundingClientRect();
    const dragHandleBottom = Math.min(
      cardRect.bottom,
      headRect ? headRect.bottom + 12 : cardRect.top + 96
    );
    return clientY >= cardRect.top && clientY <= dragHandleBottom;
  };

  learningCard.addEventListener("pointerdown", (event) => {
    if ((!state.selectedMunicipalityCode && !state.selectedGeologicalSiteId) || event.button !== 0 || !isInDragHandle(event.clientY)) {
      dragState.dragging = false;
      dragState.hasMoved = false;
      return;
    }
    dragState.pointerId = event.pointerId;
    dragState.startY = event.clientY;
    dragState.currentY = event.clientY;
    dragState.dragging = true;
    dragState.hasMoved = false;
    learningCard.style.transition = "";
    learningCard.setPointerCapture?.(event.pointerId);
  });

  learningCard.addEventListener("pointermove", (event) => {
    if (!dragState.dragging || dragState.pointerId !== event.pointerId || (!state.selectedMunicipalityCode && !state.selectedGeologicalSiteId)) {
      return;
    }
    event.preventDefault();
    dragState.currentY = event.clientY;
    const deltaY = Math.max(0, dragState.currentY - dragState.startY);
    if (deltaY > 1) {
      dragState.hasMoved = true;
    }
    learningCard.style.transform = sheetTransform(deltaY);
  });

  function endPanelDrag(event) {
    if (!dragState.dragging || dragState.pointerId !== event.pointerId || (!state.selectedMunicipalityCode && !state.selectedGeologicalSiteId)) {
      dragState.dragging = false;
      return;
    }
    const deltaY = event.clientY - dragState.startY;
    const closeThreshold = Math.max(70, learningCard.getBoundingClientRect().height * 0.5);
    if (deltaY > closeThreshold) {
      learningCard.style.transition = "transform 180ms ease";
      learningCard.style.transform = closeSheetTransform();
      window.setTimeout(() => {
        closeMunicipalityInfoPanel();
        learningCard.style.transition = "";
        learningCard.style.transform = restingTransform();
      }, 200);
    } else {
      resetSheetPosition();
    }
    dragState.dragging = false;
    dragState.hasMoved = false;
    dragState.pointerId = null;
  }

  learningCard.addEventListener("pointerup", endPanelDrag);
  learningCard.addEventListener("pointercancel", endPanelDrag);

  const svg = mapMount.querySelector("svg");
  if (!svg) {
    return;
  }

  svg.addEventListener("click", (event) => {
    if (isMapSelectionSuppressed()) {
      return;
    }
    if (dragState.hasMoved) {
      dragState.hasMoved = false;
      return;
    }
    if (!state.selectedMunicipalityCode && !state.selectedGeologicalSiteId) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    if (target.closest(".province")) {
      return;
    }
    if (target.closest(".geological-site")) {
      return;
    }
    if (target.closest(".province-labels") && target.matches("text")) {
      return;
    }
    closeMunicipalityInfoPanel();
  });
}

function startRound() {
  const availableFeatures = state.selectedIslandFilter === "ALL"
    ? state.features
    : state.features.filter((feature) => islandName(feature) === state.selectedIslandFilter);
  const availableSites = (state.selectedIslandFilter === "ALL"
    ? state.geologicalSites
    : state.geologicalSites.filter((site) => siteIsland(site) === state.selectedIslandFilter))
    .map((site) => ({ ...site, targetType: "geological" }));
  const availableTargets = [
    ...(state.selectedContentFilter !== "geological" ? availableFeatures : []),
    ...(state.selectedContentFilter !== "municipalities" ? availableSites : [])
  ];
  state.roundLimit = Math.min(roundSize, availableTargets.length);
  state.roundQueue = shuffle(availableTargets).slice(0, state.roundLimit);
  state.questionNumber = 0;
  state.roundScore = 0;
  state.roundResults = {};
  state.roundComplete = false;
  if (state.roundLimit === 0) {
    state.currentTarget = null;
    state.roundComplete = true;
    state.locked = false;
    return;
  }
  chooseTarget();
}

function renderGame() {
  if (state.gameRoundStarted) {
    startRound();
  } else {
    state.currentTarget = null;
    state.roundQueue = [];
    state.questionNumber = 0;
    state.roundScore = 0;
    state.roundResults = {};
    state.roundLimit = roundSize;
    state.roundComplete = false;
    state.locked = false;
  }
  state.selectedMunicipalityCode = "";
  state.selectedGeologicalSiteId = "";
  appRoot.innerHTML = `
    ${header("student")}
    <section class="game-layout">
      <aside class="game-card modern-hud">
        <section class="hud-card hud-current">
          <p id="targetKind" class="eyebrow">${contentFilterLabel()}</p>
          <div class="hud-current-main">
            <span class="hud-pin" aria-hidden="true">📍</span>
            <div class="hud-current-text">
              <h2 id="targetName"></h2>
              <p id="targetIsland" class="target-island"></p>
            </div>
          </div>
        </section>
        <section class="hud-card hud-progress">
          <p class="eyebrow">Progreso</p>
          <p class="hud-progress-text">Pregunta <strong id="progressCurrent">1</strong> de <span id="progressTotal">${state.roundLimit}</span></p>
          <div class="hud-progress-row">
            <div class="hud-progress-track"><span id="progressFill"></span></div>
            <strong id="progressPercent">10%</strong>
          </div>
          <div class="score-row score-row-compact">
            <span>Pregunta</span>
            <strong id="roundText">1/${state.roundLimit}</strong>
          </div>
        </section>
        <section class="hud-card hud-score">
          <p class="eyebrow">Puntuacion</p>
          <p class="hud-score-value"><strong id="scoreText">0</strong> <span>puntos</span></p>
        </section>
        <p id="gameMessage" class="game-message"></p>
        <section id="municipalityInfo" class="municipality-info" hidden></section>
        ${legalLinks("legal-links-panel")}
      </aside>
      <section class="map-frame" id="mapMount"></section>
    </section>
  `;
  wireTabs();
  const mapMount = document.querySelector("#mapMount");
  mapMount.append(createMap(handleMunicipalityPick, {
    showGeologicalSites: state.selectedContentFilter !== "municipalities",
    onSitePick: handleGeologicalSitePick
  }));
  mapMount.append(createMapLogoOverlay());
  enableMapGestures(mapMount);
  mapMount.append(createMapZoomControls());
  if (state.gameRoundStarted) {
    flyToCurrentTargetIsland();
  }
  document.querySelector("#municipalityInfo")?.setAttribute("hidden", "");
  updateGameHud(state.gameRoundStarted && state.roundLimit === 0 ? "No hay contenidos disponibles para esa seleccion." : "");
}

function renderLearningMode() {
  state.selectedMunicipalityCode = "";
  state.selectedGeologicalSiteId = "";
  appRoot.innerHTML = `
    ${header("student")}
    <section class="game-layout learning-layout">
      <aside class="game-card learning-card">
        <section id="municipalityInfo" class="municipality-info"></section>
        ${legalLinks("legal-links-panel")}
      </aside>
      <section class="map-frame" id="mapMount"></section>
    </section>
  `;
  wireTabs();
  const mapMount = document.querySelector("#mapMount");
  mapMount.append(createMap(null, {
    showLabels: true,
    showGeologicalSites: true,
    onInfoSelect: selectMunicipalityInfo,
    onSiteInfoSelect: selectGeologicalSiteInfo
  }));
  mapMount.append(createMapLogoOverlay());
  enableMapGestures(mapMount);
  mapMount.append(createMapZoomControls());
  wireLearningInfoSheet(mapMount);
  renderMunicipalityInfo();
}

function renderTeacherLogin(message = "") {
  appRoot.innerHTML = `
    ${header("teacher")}
    <section class="login-grid">
      <form id="teacherLoginForm" class="panel login-panel">
        <h2>Acceso profesorado</h2>
        <label>Email <input name="email" type="email" autocomplete="email" required /></label>
        <label>Contrasena <input name="password" type="password" autocomplete="current-password" required /></label>
        <button class="primary" type="submit">Entrar al panel</button>
        <p class="form-message">${message}</p>
      </form>
      <form id="teacherRegisterForm" class="panel login-panel">
        <h2>Crear cuenta de profesorado</h2>
        <label>Email <input name="email" type="email" autocomplete="email" required /></label>
        <label>Contrasena <input name="password" type="password" autocomplete="new-password" minlength="8" required /></label>
        <button class="secondary" type="submit">Registrarme</button>
        <p class="form-message">Cada profesor vera solo sus clases y estadisticas.</p>
      </form>
    </section>
  `;
  wireTabs();
  const handleTeacherAuth = async (event, endpoint) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await api(endpoint, {
        method: "POST",
        body: {
          email: form.get("email"),
          password: form.get("password")
        }
      });
      state.teacherToken = result.token;
      state.teacher = result.teacher || null;
      localStorage.setItem("teacherToken", result.token);
      renderTeacherDashboard();
    } catch (error) {
      renderTeacherLogin(error.message);
    }
  };

  document.querySelector("#teacherLoginForm").addEventListener("submit", async (event) => {
    await handleTeacherAuth(event, "/api/teacher/login");
  });
  document.querySelector("#teacherRegisterForm").addEventListener("submit", async (event) => {
    await handleTeacherAuth(event, "/api/teacher/register");
  });
}

function studentRows(students, classId) {
  const classStudents = students.filter((student) => student.class_id === classId);
  if (!classStudents.length) {
    return `<p class="empty">Sin alumnado todavia.</p>`;
  }

  return `
    <div class="classroom-meta">
      <p><strong>Codigo:</strong> <code>${state.summary.classes.find((klass) => klass.id === classId)?.class_code || ""}</code></p>
      <p><strong>URL:</strong> <a href="${classroomUrl(state.summary.classes.find((klass) => klass.id === classId)?.class_code || "")}" target="_blank" rel="noreferrer">${classroomUrl(state.summary.classes.find((klass) => klass.id === classId)?.class_code || "")}</a></p>
    </div>
    <table>
      <thead>
        <tr>
          <th>Alumno</th>
          <th>Usuario</th>
          <th>PIN</th>
          <th>Intentos</th>
          <th>Aciertos</th>
          <th>%</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${classStudents.map((student) => `
          <tr>
            <td>${student.display_name}</td>
            <td><code>${student.username}</code></td>
            <td><code>${student.pin}</code></td>
            <td>${student.attempts}</td>
            <td>${student.correct}</td>
            <td>${student.accuracy}</td>
            <td class="table-actions">
              <button class="icon-button" data-pin="${student.id}" title="Generar nuevo PIN">PIN</button>
              <button class="icon-button" data-reset-stats="${student.id}" title="Borrar estadisticas">Stats</button>
              <button class="icon-button danger" data-delete-student="${student.id}" title="Borrar alumno">Borrar</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function renderTeacherDashboard() {
  let summary;
  try {
    summary = await api("/api/teacher/summary", {
      token: state.teacherToken
    });
  } catch {
    localStorage.removeItem("teacherToken");
    state.teacherToken = "";
    renderTeacherLogin("Vuelve a iniciar sesion.");
    return;
  }

  const totalStudents = summary.students.length;
  const totalAttempts = summary.students.reduce((sum, student) => sum + Number(student.attempts), 0);
  const totalCorrect = summary.students.reduce((sum, student) => sum + Number(student.correct), 0);
  const accuracy = totalAttempts ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
  state.summary = summary;

  appRoot.innerHTML = `
    ${header("teacher")}
    <section class="teacher-layout">
      <section class="panel">
        <div class="section-head">
          <h2>Clases</h2>
          <button id="teacherLogout" class="secondary" type="button">Salir</button>
        </div>
        <form id="classForm" class="inline-form">
          <input name="name" placeholder="Nueva clase" required />
          <button class="primary" type="submit">Crear</button>
        </form>
        <div class="class-list">
          ${summary.classes.map((klass) => `
            <article class="class-card">
              <div class="section-head">
                <h3>${klass.name}</h3>
                <button class="icon-button danger" data-delete-class="${klass.id}" type="button" title="Borrar clase">Borrar clase</button>
              </div>
              <form class="inline-form student-form" data-class="${klass.id}">
                <input name="displayName" placeholder="Nombre del alumno" required />
                <button type="submit">Anadir</button>
              </form>
              <form class="bulk-student-form" data-class="${klass.id}">
                <label>
                  Anadir varios alumnos
                  <textarea name="names" rows="5" placeholder="Un alumno por linea"></textarea>
                </label>
                <button class="secondary" type="submit">Crear alumnado</button>
              </form>
              ${studentRows(summary.students, klass.id)}
            </article>
          `).join("") || `<p class="empty">Crea una clase para empezar.</p>`}
        </div>
      </section>
      <aside class="panel stats-panel">
        <h2>Estadisticas</h2>
        <div class="stat-grid">
          <div><span>Clases</span><strong>${summary.classes.length}</strong></div>
          <div><span>Alumnos</span><strong>${totalStudents}</strong></div>
          <div><span>Intentos</span><strong>${totalAttempts}</strong></div>
          <div><span>Acierto</span><strong>${accuracy}%</strong></div>
        </div>
        <h3>Actividad reciente</h3>
        <div class="activity-list">
          ${summary.recentAttempts.map((attempt) => `
            <p>
              <strong>${attempt.display_name}</strong>
              <span>${attempt.correct ? "acerto" : "fallo"} ${attempt.province_name}</span>
            </p>
          `).join("") || `<p class="empty">Sin actividad registrada.</p>`}
        </div>
      </aside>
    </section>
  `;
  wireTabs();

  document.querySelector("#teacherLogout").addEventListener("click", () => {
    localStorage.removeItem("teacherToken");
    state.teacherToken = "";
    renderTeacherLogin();
  });
  document.querySelector("#classForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await api("/api/classes", {
      method: "POST",
      token: state.teacherToken,
      body: { name: form.get("name") }
    });
    renderTeacherDashboard();
  });
  document.querySelectorAll(".student-form").forEach((formElement) => {
    formElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api(`/api/classes/${event.currentTarget.dataset.class}/students`, {
        method: "POST",
        token: state.teacherToken,
        body: { displayName: form.get("displayName") }
      });
      renderTeacherDashboard();
    });
  });
  document.querySelectorAll(".bulk-student-form").forEach((formElement) => {
    formElement.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      await api(`/api/classes/${event.currentTarget.dataset.class}/students-bulk`, {
        method: "POST",
        token: state.teacherToken,
        body: { names: form.get("names") }
      });
      renderTeacherDashboard();
    });
  });
  document.querySelectorAll("[data-delete-class]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Borrar esta clase y todo su alumnado, sesiones y estadisticas?")) {
        return;
      }
      await api(`/api/classes/${button.dataset.deleteClass}`, {
        method: "DELETE",
        token: state.teacherToken
      });
      renderTeacherDashboard();
    });
  });
  document.querySelectorAll("[data-pin]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/students/${button.dataset.pin}/pin`, {
        method: "POST",
        token: state.teacherToken
      });
      renderTeacherDashboard();
    });
  });
  document.querySelectorAll("[data-reset-stats]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Borrar todas las estadisticas de este alumno?")) {
        return;
      }
      await api(`/api/students/${button.dataset.resetStats}/stats`, {
        method: "DELETE",
        token: state.teacherToken
      });
      renderTeacherDashboard();
    });
  });
  document.querySelectorAll("[data-delete-student]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Borrar este alumno y todas sus estadisticas?")) {
        return;
      }
      await api(`/api/students/${button.dataset.deleteStudent}`, {
        method: "DELETE",
        token: state.teacherToken
      });
      renderTeacherDashboard();
    });
  });
}

async function loadFeatures() {
  const response = await fetch("./data/canarias-municipios.geojson", { cache: "no-store" });
  const geojson = await response.json();
  state.features = geojson.features;
}

async function loadMunicipalityInfo() {
  const response = await fetch("./data/municipios-info.json", { cache: "no-store" });
  state.municipalityInfo = await response.json();
}

async function loadGeologicalSites() {
  const response = await fetch("./data/geological-sites.json", { cache: "no-store" });
  const sites = await response.json();
  state.geologicalSites = Array.isArray(sites) ? sites : [];
}

async function loadClassroom() {
  if (!inClassroomMode()) {
    state.classroom = null;
    return;
  }

  const result = await api(`/api/classroom?code=${encodeURIComponent(state.classCode)}`);
  state.classroom = result.classroom;
}

async function render() {
  if (state.mode === "teacher") {
    if (state.teacherToken) {
      await renderTeacherDashboard();
    } else {
      renderTeacherLogin();
    }
    return;
  }

  if (inClassroomMode()) {
    if (state.studentToken && state.student) {
      if (state.playMode === "learn") {
        renderLearningMode();
      } else {
        renderGame();
      }
    } else {
      renderStudentLogin();
    }
    return;
  }

  if (state.playMode === "learn") {
    renderLearningMode();
  } else if (state.studentToken && state.student) {
    renderGame();
  } else {
    renderGame();
  }
}

async function init() {
  blockBrowserGestureZoom();
  await loadFeatures();
  await loadMunicipalityInfo();
  await loadGeologicalSites();
  await loadClassroom().catch(() => {
    throw new Error("No se encontro la clase solicitada.");
  });
  render();
  window.addEventListener("resize", syncDynamicTopbarHeight);
  window.addEventListener("resize", syncMobileMenuForViewport);
}

init().catch((error) => {
  appRoot.innerHTML = `<div class="fatal">No se pudo iniciar: ${error.message}</div>`;
});
