-- Add options column (for cloze/mcq/match exercises)
ALTER TABLE lesson_exercises
ADD COLUMN options TEXT NULL AFTER type;

-- Add answer column (for exercises that need correct answer)
ALTER TABLE lesson_exercises
ADD COLUMN answer VARCHAR(500) NULL AFTER options;
