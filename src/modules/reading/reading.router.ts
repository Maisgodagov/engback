import { Router } from 'express';

import * as readingController from './reading.controller';

export const readingRouter = Router();

readingRouter.get('/books', readingController.listBooks);
readingRouter.get('/books/:id', readingController.getBook);
readingRouter.post('/books', readingController.createBook);

readingRouter.get('/shelf', readingController.getShelf);
readingRouter.post('/shelf', readingController.addToShelf);
readingRouter.delete('/shelf/:id', readingController.removeFromShelf);

readingRouter.get('/progress/:id', readingController.getProgress);
readingRouter.post('/progress', readingController.updateProgress);

readingRouter.get('/preferences', readingController.getReaderPreferences);
readingRouter.put('/preferences', readingController.updateReaderPreferences);
