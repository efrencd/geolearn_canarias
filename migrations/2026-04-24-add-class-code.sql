ALTER TABLE classes ADD COLUMN class_code TEXT;
UPDATE classes
SET class_code = printf('C%05d', rowid)
WHERE class_code IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_classes_class_code ON classes(class_code);
