import { Router } from 'express';

import {
  addToVocab,
  excludeWord,
  getExercises,
  getWordIndex,
  markKnown,
  submitAnswer,
} from './exercises.controller';
import { requireAdmin } from '../../shared/middleware/requireAdmin';

export const exercisesRouter = Router();

exercisesRouter.get('/word-index', getWordIndex);
exercisesRouter.post('/for-content', getExercises);
exercisesRouter.post('/answer', submitAnswer);
exercisesRouter.post('/mark-known', markKnown);
exercisesRouter.post('/add-to-vocab', addToVocab);
exercisesRouter.post('/exclude-word', requireAdmin, excludeWord);
