import { Router } from 'express';

import { audioPhraseLevelsController } from './audioPhraseLevels.controller';

export const audioPhraseLevelsPublicRouter = Router();

audioPhraseLevelsPublicRouter.get('/', audioPhraseLevelsController.listPublic);
audioPhraseLevelsPublicRouter.get('/:id', audioPhraseLevelsController.getByIdPublic);
audioPhraseLevelsPublicRouter.post('/:id/progress', audioPhraseLevelsController.recordProgress);
