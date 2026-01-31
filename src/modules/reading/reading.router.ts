import { Router } from 'express';
import multer from 'multer';

import * as readingController from './reading.controller';

export const readingRouter = Router();
const uploadMaxMb = Number(process.env.READING_UPLOAD_MAX_MB ?? '200');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(1, uploadMaxMb) * 1024 * 1024 },
});

readingRouter.get('/books', readingController.listBooks);
readingRouter.get('/books/:id', readingController.getBook);
readingRouter.post('/books', readingController.createBook);
readingRouter.post('/books/upload', upload.single('file'), readingController.uploadBook);

readingRouter.get('/shelf', readingController.getShelf);
readingRouter.post('/shelf', readingController.addToShelf);
readingRouter.delete('/shelf/:id', readingController.removeFromShelf);

readingRouter.get('/progress/:id', readingController.getProgress);
readingRouter.post('/progress', readingController.updateProgress);

readingRouter.get('/preferences', readingController.getReaderPreferences);
readingRouter.put('/preferences', readingController.updateReaderPreferences);
