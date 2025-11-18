-- CreateIndex
-- Composite index for user progress queries (userId + updatedAt for sorting recent first)
CREATE INDEX `idx_user_progress` ON `video_learning_progress`(`user_id`, `updated_at`);

-- Composite index for user likes queries (userId + createdAt for sorting recent first)
CREATE INDEX `idx_user_likes` ON `video_likes`(`user_id`, `created_at`);
