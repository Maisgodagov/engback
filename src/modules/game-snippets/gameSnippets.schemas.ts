import { z } from 'zod';

export const createGameSnippetSchema = z.object({
  phrase: z.string().min(1).max(255),
  translation: z.string().max(255).optional(),
  contentId: z.number().int().positive(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
});

export const updateGameSnippetSchema = z.object({
  phrase: z.string().min(1).max(255).optional(),
  translation: z.string().max(255).nullable().optional(),
  startSeconds: z.number().nonnegative().optional(),
  endSeconds: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  isApproved: z.boolean().optional(),
});
