import { z } from 'zod';

export const createAudioPhraseLevelSchema = z.object({
  order: z.number().int().min(1),
  xpReward: z.number().int().min(0),
  isActive: z.boolean().optional(),
  snippetIds: z.array(z.string()).min(1),
});

export const updateAudioPhraseLevelSchema = z.object({
  order: z.number().int().min(1).optional(),
  xpReward: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  snippetIds: z.array(z.string()).min(1).optional(),
});

export const recordAudioPhraseProgressSchema = z.object({
  snippetId: z.string(),
  exerciseType: z.enum(['MISSING', 'ASSEMBLE', 'ODDWORD', 'TRANSLATE']),
  isCorrect: z.boolean(),
});
