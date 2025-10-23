import { Router } from 'express';

import * as controller from './videoLearning.controller';

export const videoLearningRouter = Router();

videoLearningRouter.get('/feed', controller.getFeed);
videoLearningRouter.get('/:id', controller.getContent);
videoLearningRouter.post('/:id/progress', controller.submitProgress);
