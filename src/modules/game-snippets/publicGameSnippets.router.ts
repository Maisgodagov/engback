import { Router } from 'express';

import { gameSnippetsController } from './gameSnippets.controller';

const router = Router();

router.get('/', gameSnippetsController.listActive);
router.get('/game', gameSnippetsController.listGame);

export const publicGameSnippetsRouter = router;
