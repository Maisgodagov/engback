CREATE TABLE `yandex_dictionary_cache` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `query` VARCHAR(200) NOT NULL,
    `lang` VARCHAR(10) NOT NULL,
    `response` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `uniq_yandex_query_lang` (`query`, `lang`),
    INDEX `idx_yandex_query` (`query`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
