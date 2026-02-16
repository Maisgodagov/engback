import { z } from 'zod';

export const listModerationWordsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  filter: z.enum(['all', 'moderated', 'unmoderated']).optional(),
  search: z.string().trim().max(120).optional(),
});

export const moderationWordParamSchema = z.object({
  yandexCacheId: z.coerce.number().int().positive(),
});

export const getModerationSnippetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).optional(),
  paddingSeconds: z.coerce.number().int().min(0).max(10).optional(),
});

export const saveModerationSelectionsSchema = z.object({
  selected: z
    .array(
      z.object({
        contentId: z.number().int().positive(),
        startSeconds: z.number().min(0),
        endSeconds: z.number().min(0),
        matchedText: z.string().max(255).optional().nullable(),
        contextText: z.string().max(2000).optional().nullable(),
      }),
    )
    .max(50),
});
