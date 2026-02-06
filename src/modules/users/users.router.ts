import { Router } from 'express';

import * as usersController from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', usersController.list);
usersRouter.get('/streak/history', usersController.getStreakHistory);
usersRouter.post('/streak/refresh', usersController.refreshStreak);
usersRouter.post('/xp', usersController.addXp);

