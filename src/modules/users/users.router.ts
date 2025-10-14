import { Router } from 'express';

import * as usersController from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', usersController.list);
usersRouter.post('/streak/refresh', usersController.refreshStreak);
usersRouter.post('/xp', usersController.addXp);
usersRouter.post('/streak/refresh', usersController.refreshStreak);

