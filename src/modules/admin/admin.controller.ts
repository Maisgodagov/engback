import type { Request, Response } from 'express';

import { adminService } from './admin.service';

export const getCatalog = async (_req: Request, res: Response) => {
  const catalog = await adminService.getCatalog();
  res.json(catalog);
};
