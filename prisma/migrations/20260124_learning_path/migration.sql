-- Create learning path modules
CREATE TABLE `learning_path_modules` (
  `id` VARCHAR(191) NOT NULL,
  `order_index` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `level_tag` VARCHAR(8) NULL,
  `release_status` VARCHAR(32) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uniq_learning_path_module_order` (`order_index`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create learning path lessons
CREATE TABLE `learning_path_lessons` (
  `id` VARCHAR(191) NOT NULL,
  `module_id` VARCHAR(191) NOT NULL,
  `order_index` INT NOT NULL,
  `phrase_text_en` VARCHAR(255) NOT NULL,
  `phrase_text_ru` VARCHAR(255) NULL,
  `difficulty_tag` VARCHAR(32) NULL,
  `xp_reward` INT NOT NULL DEFAULT 25,
  `main_snippet_id` VARCHAR(191) NOT NULL,
  `target_words` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uniq_learning_path_lesson_order` (`module_id`, `order_index`),
  INDEX `idx_learning_path_lesson_main_snippet` (`main_snippet_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create learning path lesson alt snippets
CREATE TABLE `learning_path_lesson_alt_snippets` (
  `id` VARCHAR(191) NOT NULL,
  `lesson_id` VARCHAR(191) NOT NULL,
  `snippet_id` VARCHAR(191) NOT NULL,
  `order` INT NULL,
  UNIQUE INDEX `uniq_learning_path_lesson_snippet` (`lesson_id`, `snippet_id`),
  INDEX `idx_learning_path_alt_snippet` (`snippet_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create learning path module progress
CREATE TABLE `learning_path_module_progress` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `module_id` VARCHAR(191) NOT NULL,
  `status` ENUM('LOCKED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'LOCKED',
  `completed_lessons_count` INT NOT NULL DEFAULT 0,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uniq_learning_path_module_progress` (`user_id`, `module_id`),
  INDEX `idx_learning_path_module_progress_module` (`module_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create learning path lesson progress
CREATE TABLE `learning_path_lesson_progress` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `lesson_id` VARCHAR(191) NOT NULL,
  `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
  `attempts_count` INT NOT NULL DEFAULT 0,
  `best_score` INT NULL,
  `last_step_index` INT NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `uniq_learning_path_lesson_progress` (`user_id`, `lesson_id`),
  INDEX `idx_learning_path_lesson_progress_lesson` (`lesson_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `learning_path_lessons`
  ADD CONSTRAINT `learning_path_lessons_module_id_fkey`
    FOREIGN KEY (`module_id`) REFERENCES `learning_path_modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `learning_path_lessons_main_snippet_id_fkey`
    FOREIGN KEY (`main_snippet_id`) REFERENCES `game_snippets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `learning_path_lesson_alt_snippets`
  ADD CONSTRAINT `learning_path_lesson_alt_snippets_lesson_id_fkey`
    FOREIGN KEY (`lesson_id`) REFERENCES `learning_path_lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `learning_path_lesson_alt_snippets_snippet_id_fkey`
    FOREIGN KEY (`snippet_id`) REFERENCES `game_snippets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `learning_path_module_progress`
  ADD CONSTRAINT `learning_path_module_progress_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `learning_path_module_progress_module_id_fkey`
    FOREIGN KEY (`module_id`) REFERENCES `learning_path_modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `learning_path_lesson_progress`
  ADD CONSTRAINT `learning_path_lesson_progress_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `learning_path_lesson_progress_lesson_id_fkey`
    FOREIGN KEY (`lesson_id`) REFERENCES `learning_path_lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
