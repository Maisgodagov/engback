import { Router } from 'express';

import * as coursesController from './courses.controller';

export const coursesRouter = Router();

coursesRouter.get('/', coursesController.list);
coursesRouter.get('/:id', coursesController.getById);

