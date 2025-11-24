import { Router } from 'express';

import { adminController } from './admin.controller';

const router = Router();

router.get('/words', adminController.getWords);
router.put('/words/:id', adminController.updateWord);
router.delete('/words/:id', adminController.deleteWord);
router.patch('/words/:id/moderate', adminController.moderateWord);

export const adminRouter = router;
