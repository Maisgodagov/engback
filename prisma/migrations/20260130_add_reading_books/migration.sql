-- Add reader font size preference
ALTER TABLE `user_preferences`
  ADD COLUMN IF NOT EXISTS `reader_font_size` INTEGER NOT NULL DEFAULT 18;

-- Create reading books table
CREATE TABLE IF NOT EXISTS `reading_books` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `author` VARCHAR(255) NULL,
  `description` TEXT NULL,
  `cover_url` VARCHAR(512) NULL,
  `file_url` VARCHAR(512) NOT NULL,
  `language` VARCHAR(16) NOT NULL DEFAULT 'en',
  `word_count` INTEGER NULL,
  `is_published` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `idx_reading_book_published` (`is_published`),
  INDEX `idx_reading_book_created_at` (`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create reading shelf table
CREATE TABLE IF NOT EXISTS `reading_shelf` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `book_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_reading_shelf_user` (`user_id`),
  INDEX `idx_reading_shelf_book` (`book_id`),
  UNIQUE INDEX `uniq_reading_shelf_user_book` (`user_id`, `book_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create reading progress table
CREATE TABLE IF NOT EXISTS `reading_progress` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `book_id` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL DEFAULT 0,
  `progress` DOUBLE NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX `idx_reading_progress_user` (`user_id`),
  INDEX `idx_reading_progress_book` (`book_id`),
  UNIQUE INDEX `uniq_reading_progress_user_book` (`user_id`, `book_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `reading_shelf`
  ADD CONSTRAINT `reading_shelf_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `reading_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `reading_shelf_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `reading_progress`
  ADD CONSTRAINT `reading_progress_book_id_fkey` FOREIGN KEY (`book_id`) REFERENCES `reading_books`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `reading_progress_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
