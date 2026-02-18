import { z } from 'zod';

export const startSessionSchema = z.object({
  targetWords: z.number().int().min(10).max(25).optional(),
});

export const submitRecognitionSchema = z.object({
  itemId: z.number().int().positive(),
  grade: z.enum(['again', 'hard', 'good', 'easy']),
});

export const submitReinforcementSchema = z.object({
  itemId: z.number().int().positive(),
  exerciseType: z.enum(['missing', 'audio_assemble', 'match_pairs']),
  isCorrect: z.boolean(),
});

export const getExamplesSchema = z.object({
  word: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});

export const finishSessionSchema = z.object({
  force: z.boolean().optional(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type SubmitRecognitionInput = z.infer<typeof submitRecognitionSchema>;
export type SubmitReinforcementInput = z.infer<typeof submitReinforcementSchema>;
export type GetExamplesInput = z.infer<typeof getExamplesSchema>;
export type FinishSessionInput = z.infer<typeof finishSessionSchema>;
