import { z } from "zod";

const idSchema = z.string().min(1);

const textBlockSchema = z.object({
  id: idSchema,
  type: z.literal("text"),
  text: z.string().min(1),
  format: z.enum(["paragraph", "heading1", "heading2", "quote"]).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
});

const mediaBlockSchema = z.object({
  id: idSchema,
  type: z.literal("media"),
  mediaType: z.enum(["image", "video", "audio"]),
  url: z.string().url(),
  caption: z.string().optional(),
  autoplay: z.boolean().optional(),
  loop: z.boolean().optional(),
});

const quizBlockSchema = z.object({
  id: idSchema,
  type: z.literal("quiz"),
  question: z.string().min(5),
  options: z.array(z.string().min(1)).min(2),
  correctOption: z.number().int().min(0),
  explanation: z.string().optional(),
  shuffleOptions: z.boolean().optional(),
});

const calloutBlockSchema = z.object({
  id: idSchema,
  type: z.literal("callout"),
  title: z.string().optional(),
  body: z.string().min(1),
  variant: z.enum(["info", "success", "warning", "danger"]).optional(),
  icon: z.string().optional(),
});

const listBlockSchema = z.object({
  id: idSchema,
  type: z.literal("list"),
  ordered: z.boolean().optional(),
  items: z.array(z.string().min(1)).min(1),
});

const embedBlockSchema = z.object({
  id: idSchema,
  type: z.literal("embed"),
  url: z.string().url(),
  caption: z.string().optional(),
  provider: z.string().optional(),
});

export const lessonContentBlockSchema = z.discriminatedUnion("type", [
  textBlockSchema,
  mediaBlockSchema,
  quizBlockSchema,
  calloutBlockSchema,
  listBlockSchema,
  embedBlockSchema,
]);

export const lessonContentSchema = z.object({
  version: z.string().default("1.0.0"),
  blocks: z
    .array(lessonContentBlockSchema)
    .min(1, "Lesson must contain at least one block"),
  metadata: z.record(z.unknown()).optional(),
});

export const createLessonSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional().nullable(),
  xpReward: z.number().int().min(0).max(9999).default(15),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  tags: z.array(z.string().min(1)).max(10).optional(),
  content: lessonContentSchema,
});

export const listLessonsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
});

export const lessonIdParamSchema = z.object({
  id: z.string().min(1),
});

export const updateLessonSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional().nullable(),
  xpReward: z.number().int().min(0).max(9999).optional(),
  durationMinutes: z.number().int().min(1).max(600).optional().nullable(),
  tags: z.array(z.string().min(1)).max(10).optional(),
  content: lessonContentSchema.optional(),
});

export type LessonContentBlockInput = z.infer<typeof lessonContentBlockSchema>;
export type LessonContentInput = z.infer<typeof lessonContentSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type ListLessonsQuery = z.infer<typeof listLessonsQuerySchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
