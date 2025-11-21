import { Router } from 'express';

import {
  addToVocab,
  getExercises,
  markKnown,
  submitAnswer,
} from './exercises.controller';

export const exercisesRouter = Router();

exercisesRouter.post('/for-content', getExercises);
exercisesRouter.post('/answer', submitAnswer);
exercisesRouter.post('/mark-known', markKnown);
exercisesRouter.post('/add-to-vocab', addToVocab);
