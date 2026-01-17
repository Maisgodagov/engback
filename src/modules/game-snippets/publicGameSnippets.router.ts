import { Router } from 'express';

import { gameSnippetsController } from './gameSnippets.controller';

const router = Router();

router.get('/', gameSnippetsController.listActive);

export const publicGameSnippetsRouter = router;
