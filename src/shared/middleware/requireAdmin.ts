import type { NextFunction, Request, Response } from 'express';

const ADMIN_HEADER = 'x-user-role';

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  const header = req.header(ADMIN_HEADER) ?? req.header(ADMIN_HEADER.toUpperCase());
  if ((header ?? '').toLowerCase() !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  return next();
};
