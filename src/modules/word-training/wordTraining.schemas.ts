import { z } from 'zod';

export const startSessionSchema = z.object({
  targetWords: z.number().int().min(1).max(5).optional(),
  preferences: z
    .object({
      cefrLevel: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).optional(),
      maxUniqueWords: z.number().int().min(1).max(5).optional(),
      maxMatchPairsPerSession: z.number().int().min(0).max(1).optional(),
      prioritizeUserInteractions: z.boolean().optional(),
      levelMix: z
        .object({
          currentLevelWeight: z.number().min(0).max(1).optional(),
          lowerLevelWeight: z.number().min(0).max(1).optional(),
          higherLevelWeight: z.number().min(0).max(1).optional(),
        })
        .optional(),
      reinforcementMode: z
        .object({
          phraseExercisesPerWord: z.number().int().min(1).max(3).optional(),
          retryMistakesAtEnd: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
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

export const markWordKnownSchema = z.object({
  wordKey: z.string().trim().min(1).max(191),
});

export const getExamplesSchema = z.object({
  word: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(30).optional(),
  paddingSeconds: z.coerce.number().int().min(0).max(10).optional(),
  paddingBeforeSeconds: z.coerce.number().int().min(0).max(10).optional(),
  paddingAfterSeconds: z.coerce.number().int().min(0).max(10).optional(),
});

export const finishSessionSchema = z.object({
  force: z.boolean().optional(),
});

export type StartSessionInput = z.infer<typeof startSessionSchema>;
export type SubmitRecognitionInput = z.infer<typeof submitRecognitionSchema>;
export type SubmitReinforcementInput = z.infer<typeof submitReinforcementSchema>;
export type MarkWordKnownInput = z.infer<typeof markWordKnownSchema>;
export type GetExamplesInput = z.infer<typeof getExamplesSchema>;
export type FinishSessionInput = z.infer<typeof finishSessionSchema>;
