import type { Request, Response } from 'express';

import {
  finishSessionSchema,
  getExamplesSchema,
  startSessionSchema,
  submitRecognitionSchema,
  submitReinforcementSchema,
} from './wordTraining.schemas';
import { wordTrainingService } from './wordTraining.service';

const getUserId = (req: Request): string | null => {
  if (req.user?.id) return req.user.id;
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof req.body?.userId === 'string' && req.body.userId.trim()) return req.body.userId.trim();
  return null;
};

const handleControllerError = (res: Response, error: unknown) => {
  const status = (error as any)?.status ?? 500;
  const message = (error as any)?.message ?? 'Internal Server Error';
  const details = (error as any)?.details;
  res.status(status).json({ message, details });
};

export const getOverview = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: 'Missing user identifier' });
      return;
    }

    const overview = await wordTrainingService.loadOverview(userId);
    res.json(overview);
  } catch (error) {
    handleControllerError(res, error);
  }
};

export const startSession = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: 'Missing user identifier' });
      return;
    }
    const payload = startSessionSchema.parse(req.body ?? {});
    const state = await wordTrainingService.startSession(userId, payload.targetWords, payload.preferences);
    res.status(201).json(state);
  } catch (error) {
    handleControllerError(res, error);
  }
};

export const getCurrentTask = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: 'Missing user identifier' });
      return;
    }
    const sessionId = String(req.params.sessionId ?? '').trim();
    if (!sessionId) {
      res.status(400).json({ message: 'Missing session id' });
      return;
    }

    const state = await wordTrainingService.getCurrentTask(userId, sessionId);
    res.json(state);
  } catch (error) {
    handleControllerError(res, error);
  }
};

export const submitRecognition = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: 'Missing user identifier' });
      return;
    }
    const sessionId = String(req.params.sessionId ?? '').trim();
    if (!sessionId) {
      res.status(400).json({ message: 'Missing session id' });
      return;
    }
    const payload = submitRecognitionSchema.parse(req.body ?? {});
    const state = await wordTrainingService.submitRecognition(userId, sessionId, payload);
    res.json(state);
  } catch (error) {
    handleControllerError(res, error);
  }
};

export const submitReinforcement = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: 'Missing user identifier' });
      return;
    }
    const sessionId = String(req.params.sessionId ?? '').trim();
    if (!sessionId) {
      res.status(400).json({ message: 'Missing session id' });
      return;
    }
    const payload = submitReinforcementSchema.parse(req.body ?? {});
    const state = await wordTrainingService.submitReinforcement(userId, sessionId, payload);
    res.json(state);
  } catch (error) {
    handleControllerError(res, error);
  }
};

export const finishSession = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ message: 'Missing user identifier' });
      return;
    }
    const sessionId = String(req.params.sessionId ?? '').trim();
    if (!sessionId) {
      res.status(400).json({ message: 'Missing session id' });
      return;
    }
    const payload = finishSessionSchema.parse(req.body ?? {});
    const state = await wordTrainingService.finishSession(userId, sessionId, payload.force);
    res.json(state);
  } catch (error) {
    handleControllerError(res, error);
  }
};

export const getExamples = async (req: Request, res: Response) => {
  try {
    const parseResult = getExamplesSchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({ message: 'Invalid request', issues: parseResult.error.issues });
      return;
    }
    const { word, limit } = parseResult.data;
    const items = await wordTrainingService.getExamplesByWord(word, limit ?? 3);
    res.json({ items });
  } catch (error) {
    handleControllerError(res, error);
  }
};
