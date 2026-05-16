CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE classes ADD COLUMN teacher_id TEXT;

ALTER TABLE sessions ADD COLUMN teacher_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_sessions_teacher_id ON sessions(teacher_id);
