import { z } from 'zod';

export const contentIdParamSchema = z.object({
  id: z.string().min(1),
});

export const submitProgressSchema = z.object({
  answers: z
    .array(
      z.object({
        exerciseId: z.string().min(1),
        selectedOption: z.number().int().min(0),
      }),
    )
    .min(1),
});

export type SubmitProgressInput = z.infer<typeof submitProgressSchema>;

export const phraseSearchQuerySchema = z.object({
  phrase: z.string().min(1).max(200),
  limit: z
    .union([z.string(), z.number()])
    .transform((value) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
    })
    .pipe(z.number().int().min(1).max(50))
    .optional(),
});

export type PhraseSearchQuery = z.infer<typeof phraseSearchQuerySchema>;

export const updateLikeSchema = z.object({
  like: z.boolean(),
});

export type UpdateLikeInput = z.infer<typeof updateLikeSchema>;
