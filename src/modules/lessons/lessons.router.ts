import { Router } from 'express';

import { lessonsController } from './lessons.controller';

const router = Router();

router.get('/', lessonsController.list);
router.get('/:id', lessonsController.getById);
router.post('/', lessonsController.create);
router.put('/:id', lessonsController.update);
router.delete('/:id', lessonsController.remove);

export const lessonsRouter = router;
