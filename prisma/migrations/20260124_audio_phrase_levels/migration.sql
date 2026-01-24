-- Create audio phrase levels
CREATE TABLE `audio_phrase_levels` (
  `id` VARCHAR(191) NOT NULL,
  `order` INT NOT NULL,
  `xp_reward` INT NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `audio_phrase_levels_order_key` (`order`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create audio phrase level snippets
CREATE TABLE `audio_phrase_level_snippets` (
  `id` VARCHAR(191) NOT NULL,
  `level_id` VARCHAR(191) NOT NULL,
  `snippet_id` VARCHAR(191) NOT NULL,
  `order` INT NULL,
  UNIQUE INDEX `audio_phrase_level_snippets_level_id_snippet_id_key` (`level_id`, `snippet_id`),
  INDEX `audio_phrase_level_snippets_snippet_id_idx` (`snippet_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user audio phrase level progress
CREATE TABLE `user_audio_phrase_level_progress` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `level_id` VARCHAR(191) NOT NULL,
  `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
  `score` INT NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `user_audio_phrase_level_progress_user_id_level_id_key` (`user_id`, `level_id`),
  INDEX `user_audio_phrase_level_progress_level_id_idx` (`level_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create user audio phrase snippet progress
CREATE TABLE `user_audio_phrase_snippet_progress` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `level_id` VARCHAR(191) NOT NULL,
  `snippet_id` VARCHAR(191) NOT NULL,
  `exercise_type` ENUM('MISSING', 'ASSEMBLE', 'ODDWORD', 'TRANSLATE') NOT NULL,
  `is_correct` BOOLEAN NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uniq_user_level_snippet_exercise` (`user_id`, `level_id`, `snippet_id`, `exercise_type`),
  INDEX `user_audio_phrase_snippet_progress_level_id_idx` (`level_id`),
  INDEX `user_audio_phrase_snippet_progress_snippet_id_idx` (`snippet_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `audio_phrase_level_snippets`
  ADD CONSTRAINT `audio_phrase_level_snippets_level_id_fkey`
    FOREIGN KEY (`level_id`) REFERENCES `audio_phrase_levels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `audio_phrase_level_snippets_snippet_id_fkey`
    FOREIGN KEY (`snippet_id`) REFERENCES `game_snippets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_audio_phrase_level_progress`
  ADD CONSTRAINT `user_audio_phrase_level_progress_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_audio_phrase_level_progress_level_id_fkey`
    FOREIGN KEY (`level_id`) REFERENCES `audio_phrase_levels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_audio_phrase_snippet_progress`
  ADD CONSTRAINT `user_audio_phrase_snippet_progress_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_audio_phrase_snippet_progress_level_id_fkey`
    FOREIGN KEY (`level_id`) REFERENCES `audio_phrase_levels`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `user_audio_phrase_snippet_progress_snippet_id_fkey`
    FOREIGN KEY (`snippet_id`) REFERENCES `game_snippets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
