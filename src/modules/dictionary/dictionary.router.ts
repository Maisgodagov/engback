import { Router } from 'express';

import * as dictionaryController from './dictionary.controller';

export const dictionaryRouter = Router();

dictionaryRouter.get('/', dictionaryController.list);
dictionaryRouter.post('/', dictionaryController.create);
dictionaryRouter.delete('/:id', dictionaryController.remove);

