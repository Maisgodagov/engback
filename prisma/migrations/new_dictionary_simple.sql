-- Simplified dictionary structure without foreign keys for easier import
SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `dict_translations`;
DROP TABLE IF EXISTS `dict_word_forms`;
DROP TABLE IF EXISTS `dict_words`;

CREATE TABLE `dict_words` (
    `id` INT NOT NULL,
    `lemma` VARCHAR(100) NOT NULL,
    `pos` VARCHAR(20) NOT NULL,
    `cefr_level` VARCHAR(2),
    `frequency_rank` INT,
    `is_irregular` BOOLEAN DEFAULT FALSE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `lemma_unique` (`lemma`, `pos`),
    INDEX `idx_lemma` (`lemma`),
    INDEX `idx_cefr` (`cefr_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dict_word_forms` (
    `id` INT NOT NULL,
    `word_id` INT NOT NULL,
    `form` VARCHAR(100) NOT NULL,
    `form_normalized` VARCHAR(100) NOT NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_normalized` (`form_normalized`),
    INDEX `idx_word_id` (`word_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `dict_translations` (
    `id` INT NOT NULL,
    `word_id` INT NOT NULL,
    `translation` VARCHAR(200) NOT NULL,
    `translation_pos` VARCHAR(20),
    `priority` TINYINT DEFAULT 3,
    `cefr_level` VARCHAR(2),
    PRIMARY KEY (`id`),
    INDEX `idx_word_id` (`word_id`),
    INDEX `idx_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS=1;
