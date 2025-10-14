import type { Request, Response } from 'express';

import { updateThemeSchema } from './preferences.schemas';
import { preferencesService } from './preferences.service';

const getUserId = (req: Request): string | null => {
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof (req.body as any)?.userId === 'string' && (req.body as any).userId.trim()) return (req.body as any).userId.trim();
  return null;
};

export const getTheme = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: 'Missing user identifier' });
  const pref = await preferencesService.getTheme(userId);
  res.json(pref);
};

export const updateTheme = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ message: 'Missing user identifier' });
  const payload = updateThemeSchema.parse(req.body);
  const pref = await preferencesService.setTheme(userId, payload.theme);
  res.json(pref);
};

