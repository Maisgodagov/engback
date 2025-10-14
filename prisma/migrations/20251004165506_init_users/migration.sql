-- CreateTable
CREATE TABLE `users` (
  `id` varchar(191) NOT NULL,
  `email` varchar(191) NOT NULL,
  `fullName` varchar(191) NOT NULL,
  `role` ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student',
  `avatarUrl` varchar(512) NULL,
  `streakDays` int NOT NULL DEFAULT 0,
  `completedLessons` int NOT NULL DEFAULT 0,
  `level` varchar(191) NOT NULL DEFAULT 'A1',
  `passwordHash` varchar(255) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `users_email_key` (`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

