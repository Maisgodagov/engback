import { Router } from 'express';

import { muellerController } from './mueller.controller';

const router = Router();

// GET /api/mueller/lookup?word=hello
router.get('/lookup', muellerController.lookup);

// GET /api/mueller/:id
router.get('/:id', muellerController.getById);

// POST /api/mueller/batch
router.post('/batch', muellerController.getByIds);

export { router as muellerRouter };
