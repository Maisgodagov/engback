import type { Request, Response, NextFunction } from 'express';

import { authService } from './auth.service';
import { loginSchema, registerSchema, telegramLoginSchema } from './auth.schemas';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = loginSchema.parse(req.body);
    const result = await authService.login(payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = registerSchema.parse(req.body);
    const result = await authService.register(payload);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const logout = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logout();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

export const telegramAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = telegramLoginSchema.parse(req.body);
    const result = await authService.telegramAuth(payload);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

