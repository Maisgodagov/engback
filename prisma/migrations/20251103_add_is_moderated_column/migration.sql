-- Add moderation status flag to video content
ALTER TABLE `video_learning_content`
  ADD COLUMN `is_moderated` BOOLEAN NOT NULL DEFAULT 0;
