import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import { audioPhraseLevelsController } from './audioPhraseLevels.controller';

export const audioPhraseLevelsAdminRouter = Router();

audioPhraseLevelsAdminRouter.get('/', requireAdmin, audioPhraseLevelsController.listAdmin);
audioPhraseLevelsAdminRouter.get('/snippets', requireAdmin, audioPhraseLevelsController.listSnippets);
audioPhraseLevelsAdminRouter.get('/:id', requireAdmin, audioPhraseLevelsController.getByIdAdmin);
audioPhraseLevelsAdminRouter.post('/', requireAdmin, audioPhraseLevelsController.create);
audioPhraseLevelsAdminRouter.patch('/:id', requireAdmin, audioPhraseLevelsController.update);
audioPhraseLevelsAdminRouter.delete('/:id', requireAdmin, audioPhraseLevelsController.remove);
