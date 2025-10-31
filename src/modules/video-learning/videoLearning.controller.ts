import type { Request, Response } from 'express';

import { videoLearningService } from './videoLearning.service';
import {
  contentIdParamSchema,
  submitProgressSchema,
  phraseSearchQuerySchema,
  updateLikeSchema,
} from './videoLearning.schemas';

const getUserId = (req: Request): string | null => {
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof req.body?.userId === 'string' && req.body.userId.trim()) return req.body.userId.trim();
  return null;
};

export const getFeed = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  // Parse pagination params
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
  const cursor = req.query.cursor ? (req.query.cursor as string) : undefined;

  const result = await videoLearningService.getFeed(userId, limit, cursor);
  res.json(result);
};

export const searchPhrase = async (req: Request, res: Response) => {
  const query = phraseSearchQuerySchema.parse({
    phrase: req.query.phrase,
    limit: req.query.limit,
  });

  const result = await videoLearningService.searchPhrase(query.phrase, query.limit);
  res.json(result);
};

export const getContent = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const content = await videoLearningService.getContentById(params.id, userId);
  if (!content) {
    res.status(404).json({ message: 'Video learning content not found' });
    return;
  }
  res.json(content);
};

export const submitProgress = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const payload = submitProgressSchema.parse(req.body);

  const result = await videoLearningService.submitProgress(userId, params.id, payload.answers);

  // Get next content recommendation
  const feedResult = await videoLearningService.getFeed(userId, 1, params.id);
  const nextContentId = feedResult.items.length > 0 ? feedResult.items[0].id : null;

  res.json({
    result,
    nextContentId,
  });
};

export const updateLike = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const payload = updateLikeSchema.parse(req.body);
  const result = await videoLearningService.updateLikeStatus(userId, params.id, payload.like);
  res.json(result);
};
