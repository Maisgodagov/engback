-- Add type column to lesson_exercises table
ALTER TABLE lesson_exercises
ADD COLUMN type VARCHAR(20) DEFAULT 'assemble' AFTER exercise_order;

-- Update existing rows to have 'assemble' type
UPDATE lesson_exercises SET type = 'assemble' WHERE type IS NULL;

-- Make type NOT NULL
ALTER TABLE lesson_exercises
MODIFY COLUMN type VARCHAR(20) NOT NULL DEFAULT 'assemble';
