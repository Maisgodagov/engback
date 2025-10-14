import { Router } from 'express';

import * as roadmapController from './roadmap.controller';

export const roadmapRouter = Router();

roadmapRouter.get('/', roadmapController.list);
roadmapRouter.patch('/lessons/:lessonId/progress', roadmapController.updateLessonStatus);
