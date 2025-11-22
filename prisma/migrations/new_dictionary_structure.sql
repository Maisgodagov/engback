-- Миграция: Новая структура словаря
-- Дата: 2025-11-21

-- Удаляем старые таблицы если они есть
DROP TABLE IF EXISTS `dict_translations`;
DROP TABLE IF EXISTS `dict_word_forms`;
DROP TABLE IF EXISTS `dict_words`;

-- Новая структура: dict_words
CREATE TABLE `dict_words` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `lemma` VARCHAR(100) NOT NULL UNIQUE,
    `pos` VARCHAR(20) NOT NULL COMMENT 'verb, noun, adj, adv, prep, conj, pron, det, num, intj',
    `cefr_level` VARCHAR(2) COMMENT 'A1, A2, B1, B2, C1, C2',
    `frequency_rank` INT COMMENT 'Google N-Gram frequency rank (lower = more frequent)',
    `is_irregular` BOOLEAN DEFAULT FALSE,
    `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX `idx_dict_words_lemma` (`lemma`),
    INDEX `idx_dict_words_cefr` (`cefr_level`),
    INDEX `idx_dict_words_freq` (`frequency_rank`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Новая структура: dict_word_forms
CREATE TABLE `dict_word_forms` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `word_id` INT NOT NULL,
    `form` VARCHAR(100) NOT NULL,
    `form_normalized` VARCHAR(100) NOT NULL COMMENT 'lowercase normalized form for matching',

    INDEX `idx_dict_word_forms_normalized` (`form_normalized`),
    INDEX `idx_dict_word_forms_word_id` (`word_id`),

    FOREIGN KEY (`word_id`) REFERENCES `dict_words`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Новая структура: dict_translations
CREATE TABLE `dict_translations` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `word_id` INT NOT NULL,
    `translation` VARCHAR(200) NOT NULL,
    `translation_pos` VARCHAR(20) COMMENT 'Part of speech of translation',
    `priority` TINYINT DEFAULT 3 COMMENT '1=primary, 2=common, 3=normal, 4=uncommon, 5=rare',
    `cefr_level` VARCHAR(2) COMMENT 'CEFR level from SMARTool',

    INDEX `idx_dict_translations_word_id` (`word_id`),
    INDEX `idx_dict_translations_priority` (`priority`),
    INDEX `idx_dict_translations_cefr` (`cefr_level`),

    FOREIGN KEY (`word_id`) REFERENCES `dict_words`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
