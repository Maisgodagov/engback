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
