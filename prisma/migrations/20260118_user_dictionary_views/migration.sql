CREATE TABLE `user_dictionary_views` (
  `id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `query` varchar(200) NOT NULL,
  `word` varchar(255) NOT NULL,
  `translation` varchar(255) NOT NULL,
  `lang` varchar(10) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uniq_user_dictionary_view` (`user_id`,`query`,`lang`),
  KEY `idx_user_dictionary_view_user_id` (`user_id`),
  CONSTRAINT `user_dictionary_views_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
