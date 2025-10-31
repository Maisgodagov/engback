-- AlterTable
ALTER TABLE `video_learning_content` ADD COLUMN `likes_count` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `video_likes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(191) NOT NULL,
    `content_id` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `video_likes_content_id_idx`(`content_id`),
    UNIQUE INDEX `video_likes_user_id_content_id_key`(`user_id`, `content_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_topic_preferences` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(100) NOT NULL,
    `likes` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `video_topic_preferences_topic_idx`(`topic`),
    UNIQUE INDEX `video_topic_preferences_user_id_topic_key`(`user_id`, `topic`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `video_likes` ADD CONSTRAINT `video_likes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `video_likes` ADD CONSTRAINT `video_likes_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `video_learning_content`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `video_topic_preferences` ADD CONSTRAINT `video_topic_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION;

