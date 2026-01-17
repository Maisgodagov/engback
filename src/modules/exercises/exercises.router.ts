import { Router } from 'express';

import {
  addToVocab,
  getExercises,
  getWordIndex,
  markKnown,
  submitAnswer,
} from './exercises.controller';

export const exercisesRouter = Router();

exercisesRouter.get('/word-index', getWordIndex);
exercisesRouter.post('/for-content', getExercises);
exercisesRouter.post('/answer', submitAnswer);
exercisesRouter.post('/mark-known', markKnown);
exercisesRouter.post('/add-to-vocab', addToVocab);
