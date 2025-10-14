-- CreateTable
CREATE TABLE `learning_path_modules` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(512) NULL,
    `order` INTEGER NOT NULL,
    `theme` VARCHAR(64) NULL,
    `icon` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `learning_path_modules_order_key`(`order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_path_lessons` (
    `id` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(512) NULL,
    `order` INTEGER NOT NULL,
    `icon` VARCHAR(64) NULL,
    `xpReward` INTEGER NOT NULL DEFAULT 15,
    `skill` VARCHAR(64) NULL,
    `difficulty` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `learning_path_lessons_moduleId_order_key`(`moduleId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_path_lesson_progress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `status` ENUM('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'COMPLETED') NOT NULL,
    `stars` INTEGER NOT NULL DEFAULT 0,
    `completedAt` DATETIME(3) NULL,
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `learning_path_lesson_progress_lessonId_idx`(`lessonId`),
    UNIQUE INDEX `learning_path_lesson_progress_userId_lessonId_key`(`userId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `learning_path_lessons` ADD CONSTRAINT `learning_path_lessons_moduleId_fkey` FOREIGN KEY (`moduleId`) REFERENCES `learning_path_modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_lesson_progress` ADD CONSTRAINT `learning_path_lesson_progress_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `learning_path_lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_path_lesson_progress` ADD CONSTRAINT `learning_path_lesson_progress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
