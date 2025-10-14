import { z } from 'zod';

export const createUserWordSchema = z.object({
  word: z.string().min(1, 'Word is required'),
  translation: z.string().min(1, 'Translation is required'),
  transcription: z.string().optional(),
  partOfSpeech: z.string().optional(),
  audioUrl: z.string().url().optional(),
  sourceLang: z.string().trim().min(2).max(8).default('en'),
  targetLang: z.string().trim().min(2).max(8).default('ru'),
});

export const deleteUserWordSchema = z.object({
  id: z.string().min(1),
});

export type CreateUserWordInput = z.infer<typeof createUserWordSchema>;

