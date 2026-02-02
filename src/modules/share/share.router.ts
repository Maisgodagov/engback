import { Router } from 'express';

import { renderWordShare, renderWordShareImage } from './share.controller';

export const shareRouter = Router();

shareRouter.get('/word/:word', renderWordShare);
shareRouter.get('/word/:word/image', renderWordShareImage);
