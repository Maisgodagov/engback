import { z } from 'zod';

export const createLearningPathModuleSchema = z.object({
  orderIndex: z.number().int().min(1),
  title: z.string().min(1),
  levelTag: z.string().max(8).optional().nullable(),
  releaseStatus: z.string().max(32).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateLearningPathModuleSchema = z.object({
  orderIndex: z.number().int().min(1).optional(),
  title: z.string().min(1).optional(),
  levelTag: z.string().max(8).optional().nullable(),
  releaseStatus: z.string().max(32).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const createLearningPathLessonSchema = z.object({
  moduleId: z.string().min(1),
  orderIndex: z.number().int().min(1),
  phraseTextEn: z.string().min(1),
  phraseTextRu: z.string().optional().nullable(),
  difficultyTag: z.string().max(32).optional().nullable(),
  xpReward: z.number().int().min(0).optional(),
  mainSnippetId: z.string().min(1),
  altSnippetIds: z.array(z.string().min(1)).max(2).optional(),
  targetWords: z.array(z.string().min(1)).max(2).optional(),
});

export const updateLearningPathLessonSchema = z.object({
  moduleId: z.string().min(1).optional(),
  orderIndex: z.number().int().min(1).optional(),
  phraseTextEn: z.string().min(1).optional(),
  phraseTextRu: z.string().optional().nullable(),
  difficultyTag: z.string().max(32).optional().nullable(),
  xpReward: z.number().int().min(0).optional(),
  mainSnippetId: z.string().min(1).optional(),
  altSnippetIds: z.array(z.string().min(1)).max(2).optional(),
  targetWords: z.array(z.string().min(1)).max(2).optional(),
});

export const lessonProgressStepSchema = z.object({
  lastStepIndex: z.number().int().min(0).optional(),
});

export const importLearningPathSnippetSchema = z.object({
  contentId: z.number().int().positive(),
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().positive(),
  phrase: z.string().min(1),
  translation: z.string().optional().nullable(),
});
