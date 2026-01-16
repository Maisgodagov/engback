import { z } from 'zod';

export const createUserWordSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  lang: z.enum(['en', 'ru']).default('en'),
  word: z.string().min(1).optional(),
  translation: z.string().min(1).optional(),
});

export const deleteUserWordSchema = z.object({
  id: z.string().min(1),
});

export type CreateUserWordInput = z.infer<typeof createUserWordSchema>;

