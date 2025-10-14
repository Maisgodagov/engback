import { Router } from 'express';

import * as preferencesController from './preferences.controller';

export const preferencesRouter = Router();

preferencesRouter.get('/', preferencesController.getTheme);
preferencesRouter.put('/', preferencesController.updateTheme);

