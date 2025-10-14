import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import { createLesson, deleteLesson, getLesson, listLessons, updateLesson } from './lessons.controller';

export const lessonsRouter = Router();

lessonsRouter.get('/', listLessons);
lessonsRouter.post('/', requireAdmin, createLesson);
lessonsRouter.get('/:id', getLesson);
lessonsRouter.put('/:id', requireAdmin, updateLesson);
lessonsRouter.delete('/:id', requireAdmin, deleteLesson);
