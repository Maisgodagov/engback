-- Add optional boolean flag to mark adult content videos
ALTER TABLE `video_learning_content`
  ADD COLUMN `is_adult_content` BOOLEAN NULL;
