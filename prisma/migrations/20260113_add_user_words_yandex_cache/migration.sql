ALTER TABLE `user_words`
  ADD COLUMN `yandex_cache_id` INT NULL,
  ADD UNIQUE INDEX `uniq_user_yandex_cache` (`userId`, `yandex_cache_id`),
  ADD INDEX `idx_user_words_yandex_cache` (`yandex_cache_id`),
  ADD CONSTRAINT `fk_user_words_yandex_cache`
    FOREIGN KEY (`yandex_cache_id`) REFERENCES `yandex_dictionary_cache`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
