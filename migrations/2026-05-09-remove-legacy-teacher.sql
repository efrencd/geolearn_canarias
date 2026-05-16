DELETE FROM attempts
WHERE student_id IN (
  SELECT s.id
  FROM students s
  JOIN classes c ON c.id = s.class_id
  WHERE c.teacher_id = 'legacy-teacher'
);

DELETE FROM sessions
WHERE teacher_id = 'legacy-teacher'
   OR student_id IN (
    SELECT s.id
    FROM students s
    JOIN classes c ON c.id = s.class_id
    WHERE c.teacher_id = 'legacy-teacher'
  );

DELETE FROM students
WHERE class_id IN (
  SELECT id
  FROM classes
  WHERE teacher_id = 'legacy-teacher'
);

DELETE FROM classes
WHERE teacher_id = 'legacy-teacher';

DELETE FROM teachers
WHERE id = 'legacy-teacher'
   OR email = 'legacy@geolearn.local';
