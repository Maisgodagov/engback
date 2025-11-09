import { z } from 'zod';
import {
  VideoLearningContentCefrLevel,
  VideoLearningContentSpeechSpeed,
  VideoLearningContentGrammarComplexity,
  VideoLearningContentVocabularyComplexity,
} from '@prisma/client';

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
  paddingSeconds: z
    .union([z.string(), z.number()])
    .transform((value) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
    })
    .pipe(z.number().int().min(0).max(10))
    .optional(),
  cursor: z
    .union([z.string(), z.number()])
    .transform((value) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
    })
    .pipe(z.number().int().min(0))
    .optional(),
  maxSnippets: z
    .union([z.string(), z.number()])
    .transform((value) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
    })
    .pipe(z.number().int().min(1).max(200))
    .optional(),
});

export type PhraseSearchQuery = z.infer<typeof phraseSearchQuerySchema>;

export const updateLikeSchema = z.object({
  like: z.boolean(),
});

export type UpdateLikeInput = z.infer<typeof updateLikeSchema>;

const timestampTupleSchema = z
  .tuple([z.number().min(0), z.number().min(0)])
  .refine(([start, end]) => end >= start, {
    message: 'Timestamp end must be greater than or equal to start',
  });

const transcriptChunkSchema = z.object({
  text: z.string().min(1),
  timestamp: timestampTupleSchema,
});

const translationChunkSchema = z.object({
  text: z.string().min(1),
  timestamp: timestampTupleSchema,
});

const topicSchema = z
  .string()
  .min(1)
  .max(100)
  .transform((value) => value.trim());

const baseExerciseSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.enum(['vocabulary', 'topic', 'statementCheck']),
  question: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  correctAnswer: z.number().int().min(0),
  word: z.string().optional(),
});

export const updateCefrLevelSchema = z.object({
  cefrLevel: z.nativeEnum(VideoLearningContentCefrLevel),
});

export const updateSpeechSpeedSchema = z.object({
  speechSpeed: z.nativeEnum(VideoLearningContentSpeechSpeed),
});

export const updateGrammarComplexitySchema = z.object({
  grammarComplexity: z.nativeEnum(VideoLearningContentGrammarComplexity),
});

export const updateVocabularyComplexitySchema = z.object({
  vocabularyComplexity: z.nativeEnum(VideoLearningContentVocabularyComplexity),
});

export const updateTopicsSchema = z.object({
  topics: z.array(topicSchema).max(20),
});

export const updateTranscriptChunksSchema = z.object({
  chunks: z.array(transcriptChunkSchema).min(1),
});

export const updateTranslationChunksSchema = z.object({
  chunks: z.array(translationChunkSchema).min(1),
});

export const updateExercisesSchema = z
  .object({
    exercises: z.array(baseExerciseSchema).max(50),
  })
  .superRefine((value, ctx) => {
    value.exercises.forEach((exercise, index) => {
      if (exercise.correctAnswer >= exercise.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['exercises', index, 'correctAnswer'],
          message: 'Correct answer index must be within options range',
        });
      }
      if (exercise.type === 'vocabulary') {
        if (!exercise.word || exercise.word.trim().length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['exercises', index, 'word'],
            message: 'Vocabulary exercise must include a word',
          });
        }
      }
    });
  });

export const updateIsAdultContentSchema = z.object({
  isAdultContent: z.boolean(),
});

export const updateModerationStatusSchema = z.object({
  isModerated: z.boolean(),
});

export type UpdateCefrLevelInput = z.infer<typeof updateCefrLevelSchema>;
export type UpdateSpeechSpeedInput = z.infer<typeof updateSpeechSpeedSchema>;
export type UpdateGrammarComplexityInput = z.infer<typeof updateGrammarComplexitySchema>;
export type UpdateVocabularyComplexityInput = z.infer<typeof updateVocabularyComplexitySchema>;
export type UpdateTopicsInput = z.infer<typeof updateTopicsSchema>;
export type UpdateTranscriptChunksInput = z.infer<typeof updateTranscriptChunksSchema>;
export type UpdateTranslationChunksInput = z.infer<typeof updateTranslationChunksSchema>;
export type UpdateExercisesInput = z.infer<typeof updateExercisesSchema>;
export type UpdateIsAdultContentInput = z.infer<typeof updateIsAdultContentSchema>;
export type UpdateModerationStatusInput = z.infer<typeof updateModerationStatusSchema>;
