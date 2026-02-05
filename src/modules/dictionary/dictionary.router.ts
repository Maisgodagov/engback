import { Router } from 'express';

import * as dictionaryController from './dictionary.controller';

export const dictionaryRouter = Router();

dictionaryRouter.get('/', dictionaryController.list);
dictionaryRouter.get('/stats', dictionaryController.getStats);
dictionaryRouter.get('/stats/words', dictionaryController.getStatsWords);
dictionaryRouter.get('/translate', dictionaryController.translatePhrase);
dictionaryRouter.post('/views', dictionaryController.recordView);
dictionaryRouter.post('/', dictionaryController.create);
dictionaryRouter.delete('/:id', dictionaryController.remove);

