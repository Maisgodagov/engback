import { z } from 'zod';

export const bookIdParamSchema = z.object({
  id: z.string().min(1),
});

export const createBookSchema = z.object({
  title: z.string().min(1).max(255),
  author: z.string().max(255).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  coverUrl: z.string().url().optional().nullable(),
  fileUrl: z.string().url(),
  language: z.string().max(16).optional(),
  wordCount: z.number().int().nonnegative().optional(),
  isPublished: z.boolean().optional(),
});

export const addShelfSchema = z.object({
  bookId: z.string().min(1),
});

export const updateProgressSchema = z.object({
  bookId: z.string().min(1),
  position: z.number().int().nonnegative().optional(),
  progress: z.number().min(0).max(1).optional(),
});

export const updateReaderPreferencesSchema = z.object({
  readerFontSize: z.number().int().min(12).max(32),
});
