import type { Request, Response } from 'express';

import { usersService } from './users.service';

const CEFR_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

export const list = async (req: Request, res: Response) => {
  // Add pagination support for 1000+ users
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

  const users = await usersService.listUsers(limit, offset);
  res.json(users);
};

const getUserId = (req: Request): string | null => {
  if (req.user?.id) return req.user.id;
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof (req.body as any)?.userId === 'string' && (req.body as any).userId.trim()) return (req.body as any).userId.trim();
  return null;
};

export const refreshStreak = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const result = await usersService.refreshStreak(userId);
  res.json(result);
};

export const addXp = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const raw = Number((req.body as any)?.amount);
  const amount = Number.isFinite(raw) ? Math.floor(raw) : NaN;
  if (!Number.isFinite(amount) || amount === 0) {
    res.status(400).json({ message: 'amount must be a non-zero integer' });
    return;
  }
  const result = await usersService.addXp(userId, amount);
  res.json(result);
};

export const getStreakHistory = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const result = await usersService.getStreakHistory(userId);
  res.json(result);
};

export const updateLevel = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const rawLevel = String((req.body as any)?.level ?? '').trim().toUpperCase();
  if (!CEFR_LEVELS.has(rawLevel)) {
    res.status(400).json({ message: 'level must be one of A1, A2, B1, B2, C1, C2' });
    return;
  }

  const result = await usersService.updateLevel(userId, rawLevel);
  res.json(result);
};

