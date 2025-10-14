ALTER TABLE `learning_path_lessons`
  ADD CONSTRAINT `learning_path_lessons_moduleId_fkey`
  FOREIGN KEY (`moduleId`) REFERENCES `learning_path_modules`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `learning_path_lesson_progress`
  ADD CONSTRAINT `learning_path_lesson_progress_lessonId_fkey`
  FOREIGN KEY (`lessonId`) REFERENCES `learning_path_lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `learning_path_lesson_progress`
  ADD CONSTRAINT `learning_path_lesson_progress_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
