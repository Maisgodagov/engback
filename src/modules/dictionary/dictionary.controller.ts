import type { Request, Response } from 'express';

import {
  createUserPhraseSchema,
  createUserWordSchema,
  deleteUserPhraseSchema,
  deleteUserWordSchema,
  recordDictionaryViewSchema,
} from './dictionary.schemas';
import { dictionaryService } from './dictionary.service';

const getUserId = (req: Request): string | null => {
  const header = req.header('x-user-id');
  if (header && header.trim()) {
    return header.trim();
  }
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) {
    return req.query.userId.trim();
  }
  if (typeof req.body?.userId === 'string' && req.body.userId.trim()) {
    return req.body.userId.trim();
  }
  return null;
};

export const list = async (req: Request, res: Response) => {
  console.log('[Dictionary] === REQUEST RECEIVED ===');
  console.log('[Dictionary] Headers:', req.headers);
  console.log('[Dictionary] Query:', req.query);
  console.log('[Dictionary] Body:', req.body);

  const userId = getUserId(req);
  console.log('[Dictionary] Extracted userId:', userId);

  if (!userId) {
    console.log('[Dictionary] ERROR: No userId found');
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  // Add pagination support
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

  const items = await dictionaryService.list(userId, limit, offset);
  console.log('[Dictionary] Found items:', items.length);
  if (items.length > 0) {
    console.log('[Dictionary] First item:', items[0]);
  }
  console.log('[Dictionary] Sending response...');
  res.json(items);
};

export const getStats = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const stats = await dictionaryService.getStats(userId);
  res.json(stats);
};

export const getStatsWords = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const status = String(req.query.status ?? '');
  if (status !== 'learning' && status !== 'known' && status !== 'viewed') {
    res.status(400).json({ message: 'Unknown status' });
    return;
  }
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
  const items = await dictionaryService.getStatsWords(
    userId,
    status as 'learning' | 'known' | 'viewed',
    limit,
    offset,
  );
  res.json({ items });
};

export const recordView = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const payload = recordDictionaryViewSchema.parse(req.body);
  await dictionaryService.recordView(userId, payload);
  res.status(204).send();
};

export const create = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const payload = createUserWordSchema.parse(req.body);
  const entry = await dictionaryService.create(userId, payload);
  res.status(201).json({ ...entry, type: 'word' });
};

export const createPhrase = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const payload = createUserPhraseSchema.parse(req.body);
  const entry = await dictionaryService.createPhrase(userId, payload);
  res.status(201).json({ ...entry, type: 'phrase' });
};

export const remove = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const params = deleteUserWordSchema.parse({ id: req.params.id });
  const deleted = await dictionaryService.remove(userId, params.id);
  if (!deleted) {
    res.status(404).json({ message: 'Word not found' });
    return;
  }
  res.status(204).end();
};

export const removePhrase = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const params = deleteUserPhraseSchema.parse({ id: req.params.id });
  const deleted = await dictionaryService.removePhrase(userId, params.id);
  if (!deleted) {
    res.status(404).json({ message: 'Phrase not found' });
    return;
  }
  res.status(204).end();
};

export const translatePhrase = async (req: Request, res: Response) => {
  const text = typeof req.query.text === 'string' ? req.query.text.trim() : '';
  const from = typeof req.query.from === 'string' ? req.query.from.trim() : 'en';
  const to = typeof req.query.to === 'string' ? req.query.to.trim() : 'ru';

  if (!text) {
    res.status(400).json({ message: 'Missing text' });
    return;
  }
  if (text.length > 300) {
    res.status(400).json({ message: 'Text is too long' });
    return;
  }

  try {
    const translation = await dictionaryService.translatePhrase(text, from, to);
    res.json({ translation });
  } catch (error: any) {
    const message = error?.message ?? 'Translation error';
    res.status(error?.status ?? 502).json({ message });
  }
};

