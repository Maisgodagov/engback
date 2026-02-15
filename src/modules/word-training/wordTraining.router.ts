import { Router } from 'express';

import * as wordTrainingController from './wordTraining.controller';

export const wordTrainingRouter = Router();

wordTrainingRouter.get('/overview', wordTrainingController.getOverview);
wordTrainingRouter.get('/examples', wordTrainingController.getExamples);
wordTrainingRouter.post('/sessions', wordTrainingController.startSession);
wordTrainingRouter.get('/sessions/:sessionId', wordTrainingController.getCurrentTask);
wordTrainingRouter.post('/sessions/:sessionId/recognition', wordTrainingController.submitRecognition);
wordTrainingRouter.post('/sessions/:sessionId/reinforcement', wordTrainingController.submitReinforcement);
wordTrainingRouter.post('/sessions/:sessionId/finish', wordTrainingController.finishSession);
