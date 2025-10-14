import type { Request, Response } from 'express';

import { authService } from './auth.service';
import { loginSchema, registerSchema } from './auth.schemas';

export const login = async (req: Request, res: Response) => {
  const payload = loginSchema.parse(req.body);
  const result = await authService.login(payload);
  res.json(result);
};

export const register = async (req: Request, res: Response) => {
  const payload = registerSchema.parse(req.body);
  const result = await authService.register(payload);
  res.status(201).json(result);
};

export const logout = async (_req: Request, res: Response) => {
  await authService.logout();
  res.status(204).end();
};

