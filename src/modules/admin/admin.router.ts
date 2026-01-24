import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import { adminController } from './admin.controller';

const router = Router();

router.get('/words', adminController.getWords);
router.put('/words/:id', adminController.updateWord);
router.delete('/words/:id', adminController.deleteWord);
router.patch('/words/:id/moderate', adminController.moderateWord);

// Users admin
router.get('/users', requireAdmin, adminController.getUsers);
router.patch('/users/:id/role', requireAdmin, adminController.updateUserRole);

export const adminRouter = router;
