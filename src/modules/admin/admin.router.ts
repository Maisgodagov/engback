import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import { adminController } from './admin.controller';

const router = Router();

router.get('/words', adminController.getWords);
router.put('/words/:id', adminController.updateWord);
router.delete('/words/:id', adminController.deleteWord);
router.patch('/words/:id/moderate', adminController.moderateWord);

// Precomputed exercises moderation
router.get('/exercises', adminController.getPrecomputed);
router.put('/exercises/:id', adminController.updatePrecomputed);
router.delete('/exercises/:id', adminController.deletePrecomputed);
router.patch('/exercises/:id/moderate', adminController.moderatePrecomputed);

// Users admin
router.get('/users', requireAdmin, adminController.getUsers);
router.patch('/users/:id/role', requireAdmin, adminController.updateUserRole);

export const adminRouter = router;
