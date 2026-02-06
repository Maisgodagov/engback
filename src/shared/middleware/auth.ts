import type { NextFunction, Request, Response } from "express";

import { verifyToken } from "../auth/jwt";

const getBearerToken = (req: Request): string | null => {
  const auth = req.header("authorization") ?? req.header("Authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
};

export const authMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const token = getBearerToken(req);
  if (!token) return next();

  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      role: payload.role,
      email: payload.email,
    };
  } catch (error) {
    req.authError = error as Error;
  }
  return next();
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.user) return next();
  if (req.authError) {
    const status = (req.authError as any).status ?? 401;
    return res.status(status).json({ message: req.authError.message ?? "Unauthorized" });
  }
  return res.status(401).json({ message: "Unauthorized" });
};
