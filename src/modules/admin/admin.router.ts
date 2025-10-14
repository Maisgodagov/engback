import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import { getCatalog } from './admin.controller';

export const adminRouter = Router();

adminRouter.get('/catalog', requireAdmin, getCatalog);
