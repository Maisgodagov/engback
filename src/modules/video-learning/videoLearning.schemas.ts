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
  sampleSize: z
    .union([z.string(), z.number()])
    .transform((value) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
    })
    .pipe(z.number().int().min(100).max(15000))
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

export const createTagSchema = z.object({
  name: topicSchema,
});

export const tagIdParamSchema = z.object({
  tagId: z
    .union([z.string(), z.number()])
    .transform((value) => {
      const numeric = typeof value === 'string' ? Number(value) : value;
      return Number.isFinite(numeric) ? Math.trunc(numeric) : undefined;
    })
    .pipe(z.number().int().positive()),
});

export const updateVideoTagsSchema = z.object({
  tagIds: z.array(z.number().int().positive()).max(20),
});

export const assignAuthorTagSchema = z.object({
  author: z.string().trim().min(1).max(255),
  tagId: z.number().int().positive(),
});

export const updateTranscriptChunksSchema = z.object({
  chunks: z.array(transcriptChunkSchema).min(1),
});

export const updateTranslationChunksSchema = z.object({
  chunks: z.array(translationChunkSchema).min(1),
});

export const updateSubtitleChunkSchema = z.object({
  chunkIndex: z.number().int().min(0),
  transcript: transcriptChunkSchema,
  translation: translationChunkSchema,
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
export type CreateTagInput = z.infer<typeof createTagSchema>;
export type TagIdParamInput = z.infer<typeof tagIdParamSchema>;
export type UpdateVideoTagsInput = z.infer<typeof updateVideoTagsSchema>;
export type AssignAuthorTagInput = z.infer<typeof assignAuthorTagSchema>;
export type UpdateTranscriptChunksInput = z.infer<typeof updateTranscriptChunksSchema>;
export type UpdateTranslationChunksInput = z.infer<typeof updateTranslationChunksSchema>;
export type UpdateSubtitleChunkInput = z.infer<typeof updateSubtitleChunkSchema>;
export type UpdateExercisesInput = z.infer<typeof updateExercisesSchema>;
export type UpdateIsAdultContentInput = z.infer<typeof updateIsAdultContentSchema>;
export type UpdateModerationStatusInput = z.infer<typeof updateModerationStatusSchema>;

export const updateAuthorSchema = z.object({
  author: z
    .string()
    .trim()
    .refine(
      (value) => {
        if (value === '') return true;
        return /^@[a-zA-Z0-9_]+$/.test(value);
      },
      {
        message: 'Author must start with @ followed by English letters, numbers, or underscores',
      },
    )
    .transform((value) => (value === '' ? null : value)),
});

export type UpdateAuthorInput = z.infer<typeof updateAuthorSchema>;
