-- CreateIndex
-- Composite index for feed filtering (most common query pattern)
CREATE INDEX `idx_feed_filters` ON `video_learning_content`(`is_moderated`, `is_adult_content`, `cefr_level`, `speech_speed`);

-- Individual indexes for flexibility
CREATE INDEX `idx_speech_speed` ON `video_learning_content`(`speech_speed`);
CREATE INDEX `idx_adult_content` ON `video_learning_content`(`is_adult_content`);
CREATE INDEX `idx_moderated` ON `video_learning_content`(`is_moderated`);
