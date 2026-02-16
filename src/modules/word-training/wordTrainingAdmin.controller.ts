import type { Request, Response } from 'express';

import {
  getModerationSnippetsQuerySchema,
  listModerationWordsQuerySchema,
  moderationWordParamSchema,
  saveModerationSelectionsSchema,
} from './wordTrainingAdmin.schemas';
import { wordTrainingService } from './wordTraining.service';

const getUserId = (req: Request): string | null => {
  if (req.user?.id) return req.user.id;
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  return null;
};

const handleError = (res: Response, error: unknown) => {
  const status = (error as any)?.status ?? 500;
  const message = (error as any)?.message ?? 'Internal Server Error';
  res.status(status).json({ message });
};

export const listModerationWords = async (req: Request, res: Response) => {
  try {
    const query = listModerationWordsQuerySchema.parse(req.query ?? {});
    const result = await wordTrainingService.listModerationWords(query);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const getModerationSnippets = async (req: Request, res: Response) => {
  try {
    const params = moderationWordParamSchema.parse(req.params);
    const query = getModerationSnippetsQuerySchema.parse(req.query ?? {});
    const result = await wordTrainingService.getModerationSnippets(params.yandexCacheId, query);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

export const saveModerationSelections = async (req: Request, res: Response) => {
  try {
    const adminUserId = getUserId(req);
    if (!adminUserId) {
      res.status(401).json({ message: 'Missing user identifier' });
      return;
    }
    const params = moderationWordParamSchema.parse(req.params);
    const payload = saveModerationSelectionsSchema.parse(req.body ?? {});
    const result = await wordTrainingService.saveModerationSelections(
      adminUserId,
      params.yandexCacheId,
      payload.selected,
    );
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};
