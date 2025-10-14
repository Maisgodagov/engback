-- CreateTable
CREATE TABLE `user_words` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `word` varchar(255) NOT NULL,
  `translation` varchar(255) NOT NULL,
  `transcription` varchar(255) NULL,
  `partOfSpeech` varchar(64) NULL,
  `audioUrl` varchar(512) NULL,
  `sourceLang` varchar(8) NOT NULL DEFAULT 'en',
  `targetLang` varchar(8) NOT NULL DEFAULT 'ru',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `user_words_userId_idx` (`userId`),
  CONSTRAINT `user_words_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

