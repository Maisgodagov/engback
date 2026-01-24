import { Router } from 'express';
import { learningPathController } from './learningPath.controller';

export const learningPathRouter = Router();

learningPathRouter.get('/path', learningPathController.listPath);
learningPathRouter.get('/lessons/:id', learningPathController.getLesson);
learningPathRouter.post('/lessons/:id/start', learningPathController.startLesson);
learningPathRouter.post('/lessons/:id/step', learningPathController.updateLessonStep);
learningPathRouter.post('/lessons/:id/complete', learningPathController.completeLesson);
