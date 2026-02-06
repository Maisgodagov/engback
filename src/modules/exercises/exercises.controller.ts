import type { Request, Response } from 'express';

import {
  addToVocabSchema,
  getExercisesSchema,
  markKnownSchema,
  submitAnswerSchema,
} from './exercises.schemas';
import { exercisesService } from './exercises.service';

const getUserId = (req: Request): string | null => {
  if (req.user?.id) return req.user.id;
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof req.body?.userId === 'string' && req.body.userId.trim()) return req.body.userId.trim();
  return null;
};

export const getWordIndex = async (_req: Request, res: Response) => {
  try {
    const items = await exercisesService.getWordIndex();
    res.json({ items });
  } catch (error) {
    console.error('[CONTROLLER] Failed to get word index', error);
    res.status(500).json({ message: 'Failed to get word index' });
  }
};

export const getExercises = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  console.log(`[CONTROLLER] 📨 getExercises request from userId: ${userId}`);

  if (!userId) {
    console.log(`[CONTROLLER] ❌ Missing userId`);
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const parseResult = getExercisesSchema.safeParse(req.body);
  if (!parseResult.success) {
    console.log(`[CONTROLLER] ❌ Invalid request body:`, parseResult.error.issues);
    res.status(400).json({ message: 'Invalid request', issues: parseResult.error.issues });
    return;
  }

  const { wordIds, wordLimit, exerciseLimit } = parseResult.data;
  console.log(`[CONTROLLER] 📦 Request params: wordIds.length=${wordIds.length}, wordLimit=${wordLimit}, exerciseLimit=${exerciseLimit}`);

  try {
    const exercises = await exercisesService.getExercisesForUser(
      userId,
      wordIds,
      wordLimit,
      exerciseLimit,
    );
    console.log(`[CONTROLLER] ✅ Sending ${exercises.length} exercises to client`);
    res.json({ exercises });
  } catch (error) {
    console.error('[CONTROLLER] ❌ Failed to get exercises', error);
    res.status(500).json({ message: 'Failed to get exercises' });
  }
};

export const submitAnswer = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const parseResult = submitAnswerSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid request', issues: parseResult.error.issues });
    return;
  }

  const { wordId, isCorrect } = parseResult.data;

  try {
    const progress = await exercisesService.submitAnswer(userId, wordId, isCorrect);
    res.json({ progress });
  } catch (error) {
    console.error('Failed to submit answer', error);
    res.status(500).json({ message: 'Failed to submit answer' });
  }
};

export const markKnown = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const parseResult = markKnownSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid request', issues: parseResult.error.issues });
    return;
  }

  const { wordId } = parseResult.data;

  try {
    const progress = await exercisesService.markKnown(userId, wordId);
    res.json({ progress });
  } catch (error) {
    console.error('Failed to mark known', error);
    res.status(500).json({ message: 'Failed to mark known' });
  }
};

export const addToVocab = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const parseResult = addToVocabSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ message: 'Invalid request', issues: parseResult.error.issues });
    return;
  }

  const { wordId, note } = parseResult.data;

  try {
    const progress = await exercisesService.addToVocab(userId, wordId, note);
    res.json({ progress });
  } catch (error) {
    console.error('Failed to add to vocab', error);
    res.status(500).json({ message: 'Failed to add to vocab' });
  }
};
