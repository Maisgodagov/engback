import { z } from 'zod';

export const getExercisesSchema = z.object({
  wordIds: z.array(z.number().int().positive()).min(1),
  videoId: z.number().int().positive().optional(),
  wordLimit: z.number().int().positive().max(20).optional(),
  exerciseLimit: z.number().int().positive().max(40).optional(),
});

export type GetExercisesInput = z.infer<typeof getExercisesSchema>;

export const submitAnswerSchema = z.object({
  wordId: z.number().int().positive(),
  isCorrect: z.boolean(),
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

export const markKnownSchema = z.object({
  wordId: z.number().int().positive(),
});
export type MarkKnownInput = z.infer<typeof markKnownSchema>;

export const addToVocabSchema = z.object({
  wordId: z.number().int().positive(),
  note: z.string().trim().max(255).optional(),
});
export type AddToVocabInput = z.infer<typeof addToVocabSchema>;

export const excludeWordSchema = z.object({
  wordId: z.number().int().positive(),
});
export type ExcludeWordInput = z.infer<typeof excludeWordSchema>;
