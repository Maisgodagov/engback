import type { Request, Response } from 'express';

import {
  addShelfSchema,
  bookIdParamSchema,
  createBookSchema,
  updateBookSchema,
  updateProgressSchema,
  updateReaderPreferencesSchema,
  uploadBookSchema,
} from './reading.schemas';
import { readingService } from './reading.service';

const getUserId = (req: Request): string | null => {
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof (req.body as any)?.userId === 'string' && (req.body as any).userId.trim()) return (req.body as any).userId.trim();
  return null;
};

const requireAdmin = (req: Request, res: Response): boolean => {
  const role = (req.header('x-user-role') ?? '').toLowerCase();
  if (role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return false;
  }
  return true;
};

export const listBooks = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const books = await readingService.listBooks(userId);
  res.json({ items: books });
};

export const getBook = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const params = bookIdParamSchema.parse({ id: req.params.id });
  const book = await readingService.getBook(params.id, userId);
  if (!book) {
    res.status(404).json({ message: 'Book not found' });
    return;
  }
  res.json(book);
};

export const createBook = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const payload = createBookSchema.parse(req.body);
  const book = await readingService.createBook(payload);
  res.status(201).json(book);
};

export const uploadBook = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const payload = uploadBookSchema.parse(req.body ?? {});
  const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
  if (!file) {
    res.status(400).json({ message: 'Missing epub file' });
    return;
  }
  try {
    const book = await readingService.uploadBookFromEpub(file, payload);
    res.status(201).json(book);
  } catch (err: any) {
    console.error('Failed to upload book', err);
    res.status(500).json({ message: err?.message ?? 'Failed to upload book' });
  }
};

export const updateBook = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const params = bookIdParamSchema.parse({ id: req.params.id });
  const payload = updateBookSchema.parse(req.body);
  const book = await readingService.updateBook(params.id, payload);
  res.json(book);
};

export const deleteBook = async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const params = bookIdParamSchema.parse({ id: req.params.id });
  await readingService.deleteBook(params.id);
  res.status(204).send();
};

export const addToShelf = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const payload = addShelfSchema.parse(req.body);
  await readingService.addToShelf(userId, payload.bookId);
  res.status(204).send();
};

export const removeFromShelf = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = bookIdParamSchema.parse({ id: req.params.id });
  await readingService.removeFromShelf(userId, params.id);
  res.status(204).send();
};

export const getShelf = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const items = await readingService.getShelf(userId);
  res.json({ items });
};

export const updateProgress = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const payload = updateProgressSchema.parse(req.body);
  const result = await readingService.updateProgress(userId, payload);
  res.json(result);
};

export const getProgress = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = bookIdParamSchema.parse({ id: req.params.id });
  const progress = await readingService.getProgress(userId, params.id);
  res.json(progress ?? null);
};

export const getReaderPreferences = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const pref = await readingService.getReaderPreferences(userId);
  res.json(pref);
};

export const updateReaderPreferences = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const payload = updateReaderPreferencesSchema.parse(req.body);
  const pref = await readingService.updateReaderPreferences(userId, payload.readerFontSize);
  res.json(pref);
};
