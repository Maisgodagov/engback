import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import * as controller from './wordTrainingAdmin.controller';

export const wordTrainingAdminRouter = Router();

wordTrainingAdminRouter.get('/words', requireAdmin, controller.listModerationWords);
wordTrainingAdminRouter.get('/words/:yandexCacheId/snippets', requireAdmin, controller.getModerationSnippets);
wordTrainingAdminRouter.put('/words/:yandexCacheId/snippets', requireAdmin, controller.saveModerationSelections);
