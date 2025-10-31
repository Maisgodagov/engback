import { Router } from 'express';

import * as controller from './videoLearning.controller';

export const videoLearningRouter = Router();

videoLearningRouter.get('/feed', controller.getFeed);
videoLearningRouter.get('/search', controller.searchPhrase);
videoLearningRouter.get('/:id', controller.getContent);
videoLearningRouter.post('/:id/like', controller.updateLike);
videoLearningRouter.post('/:id/progress', controller.submitProgress);
