import type { Request, Response } from 'express';

import { usersService } from './users.service';

export const list = async (_req: Request, res: Response) => {
  const users = await usersService.listUsers();
  res.json(users);
};

const getUserId = (req: Request): string | null => {
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

