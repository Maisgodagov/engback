-- ================================================
-- Миграция: Реструктуризация курсов, модулей и уроков
-- ================================================

-- Шаг 1: Удаление старых таблиц и связанных constraint
DROP TABLE IF EXISTS `learning_path_lesson_progress`;
DROP TABLE IF EXISTS `learning_path_lessons`;
DROP TABLE IF EXISTS `learning_path_modules`;

-- Шаг 2: Подготовка к созданию новой структуры
-- (старые enum будут автоматически удалены при удалении таблиц)

-- Шаг 3: Создание таблицы Курсов
CREATE TABLE `courses` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(512) NULL,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `difficultyLevels` VARCHAR(64) NOT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 4: Создание таблицы Модулей
CREATE TABLE `modules` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 5: Создание таблицы Уроков
CREATE TABLE `lessons` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `content` JSON NOT NULL,
    `xpReward` INTEGER NOT NULL DEFAULT 15,
    `duration` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 6: Создание связующей таблицы Курс-Модуль
CREATE TABLE `course_modules` (
    `id` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,

    INDEX `course_modules_moduleId_idx`(`moduleId`),
    UNIQUE INDEX `course_modules_courseId_moduleId_key`(`courseId`, `moduleId`),
    UNIQUE INDEX `course_modules_courseId_order_key`(`courseId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 7: Создание связующей таблицы Модуль-Урок
CREATE TABLE `module_lessons` (
    `id` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `order` INTEGER NOT NULL,

    INDEX `module_lessons_lessonId_idx`(`lessonId`),
    UNIQUE INDEX `module_lessons_moduleId_lessonId_key`(`moduleId`, `lessonId`),
    UNIQUE INDEX `module_lessons_moduleId_order_key`(`moduleId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 8: Создание таблицы прогресса по курсам
CREATE TABLE `user_course_progress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `courseId` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `user_course_progress_courseId_idx`(`courseId`),
    UNIQUE INDEX `user_course_progress_userId_courseId_key`(`userId`, `courseId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 9: Создание таблицы прогресса по модулям
CREATE TABLE `user_module_progress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `user_module_progress_moduleId_idx`(`moduleId`),
    UNIQUE INDEX `user_module_progress_userId_moduleId_key`(`userId`, `moduleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 10: Создание таблицы прогресса по урокам
CREATE TABLE `user_lesson_progress` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
    `stars` INTEGER NOT NULL DEFAULT 0,
    `score` INTEGER NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `user_lesson_progress_lessonId_idx`(`lessonId`),
    UNIQUE INDEX `user_lesson_progress_userId_lessonId_key`(`userId`, `lessonId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Шаг 11: Добавление внешних ключей

-- Для course_modules
ALTER TABLE `course_modules` ADD CONSTRAINT `course_modules_courseId_fkey`
    FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `course_modules` ADD CONSTRAINT `course_modules_moduleId_fkey`
    FOREIGN KEY (`moduleId`) REFERENCES `modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Для module_lessons
ALTER TABLE `module_lessons` ADD CONSTRAINT `module_lessons_moduleId_fkey`
    FOREIGN KEY (`moduleId`) REFERENCES `modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `module_lessons` ADD CONSTRAINT `module_lessons_lessonId_fkey`
    FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Для user_course_progress
ALTER TABLE `user_course_progress` ADD CONSTRAINT `user_course_progress_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_course_progress` ADD CONSTRAINT `user_course_progress_courseId_fkey`
    FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Для user_module_progress
ALTER TABLE `user_module_progress` ADD CONSTRAINT `user_module_progress_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_module_progress` ADD CONSTRAINT `user_module_progress_moduleId_fkey`
    FOREIGN KEY (`moduleId`) REFERENCES `modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Для user_lesson_progress
ALTER TABLE `user_lesson_progress` ADD CONSTRAINT `user_lesson_progress_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `user_lesson_progress` ADD CONSTRAINT `user_lesson_progress_lessonId_fkey`
    FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
