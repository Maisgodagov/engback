import { z } from 'zod';

const cefrLevelSchema = z
  .string()
  .regex(/^(a1|a2|b1|b2|c1|c2)$/i)
  .transform((value) => value.toUpperCase());

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
  cefrLevel: cefrLevelSchema.optional().nullable(),
  wordCount: z.number().int().nonnegative().optional(),
  isPublished: z.boolean().optional(),
});

export const uploadBookSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  author: z.string().max(255).optional(),
  description: z.string().max(5000).optional(),
  language: z.string().max(16).optional(),
  cefrLevel: cefrLevelSchema.optional().nullable(),
});

export const updateBookSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  author: z.string().max(255).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  cefrLevel: cefrLevelSchema.optional().nullable(),
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
