import { Router } from 'express';

import { requireAdmin } from '../../shared/middleware/requireAdmin';
import { gameSnippetsController } from './gameSnippets.controller';

const router = Router();

router.get('/', requireAdmin, gameSnippetsController.list);
router.post('/', requireAdmin, gameSnippetsController.create);
router.patch('/:id', requireAdmin, gameSnippetsController.update);
router.delete('/:id', requireAdmin, gameSnippetsController.remove);

export const gameSnippetsRouter = router;
