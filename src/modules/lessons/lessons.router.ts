import { Router } from 'express';

import { lessonsController } from './lessons.controller';

const router = Router();

router.get('/', lessonsController.list);
router.get('/:id', lessonsController.getById);

export const lessonsRouter = router;

