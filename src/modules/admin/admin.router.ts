import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import { adminController } from './admin.controller';

const router = Router();

// Users admin
router.get('/users', requireAdmin, adminController.getUsers);
router.patch('/users/:id/role', requireAdmin, adminController.updateUserRole);

export const adminRouter = router;
