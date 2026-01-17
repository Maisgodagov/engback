CREATE TABLE `game_snippets` (
  `id` VARCHAR(191) NOT NULL,
  `phrase` VARCHAR(255) NOT NULL,
  `content_id` INTEGER NOT NULL,
  `start_seconds` FLOAT NOT NULL,
  `end_seconds` FLOAT NOT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `game_snippets_content_id_idx` (`content_id`),
  INDEX `game_snippets_phrase_idx` (`phrase`),
  PRIMARY KEY (`id`),
  CONSTRAINT `game_snippets_content_id_fkey` FOREIGN KEY (`content_id`) REFERENCES `video_learning_content`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
