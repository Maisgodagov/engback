import { Router } from 'express';
import { learningPathController } from './learningPath.controller';
import { requireAdmin } from '../../shared/middleware/requireAdmin';

export const learningPathAdminRouter = Router();

learningPathAdminRouter.use(requireAdmin);

learningPathAdminRouter.get('/modules', learningPathController.listModulesAdmin);
learningPathAdminRouter.post('/modules', learningPathController.createModule);
learningPathAdminRouter.patch('/modules/:id', learningPathController.updateModule);
learningPathAdminRouter.delete('/modules/:id', learningPathController.removeModule);

learningPathAdminRouter.get('/lessons', learningPathController.listLessonsAdmin);
learningPathAdminRouter.get('/lessons/:id', learningPathController.getLessonAdmin);
learningPathAdminRouter.post('/lessons', learningPathController.createLesson);
learningPathAdminRouter.patch('/lessons/:id', learningPathController.updateLesson);
learningPathAdminRouter.delete('/lessons/:id', learningPathController.removeLesson);

learningPathAdminRouter.get('/snippets', learningPathController.searchSnippets);
