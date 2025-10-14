import type {
  LessonContent,
  LessonDetailDto,
  LessonSummaryDto,
} from "../../shared/types";
import { prisma } from "../../shared/prisma/prismaClient";

import type {
  CreateLessonInput,
  LessonContentBlockInput,
  LessonContentInput,
  ListLessonsQuery,
  UpdateLessonInput,
} from "./lessons.schemas";

type LessonRecord = {
  id: string;
  title: string;
  description: string | null;
  content: unknown;
  xpReward: number;
  duration: number | null;
  createdAt: Date;
  updatedAt: Date;
};

type LessonDelegate = {
  create: (args: unknown) => Promise<LessonRecord>;
  findMany: (args: unknown) => Promise<LessonRecord[]>;
  findUnique: (args: unknown) => Promise<LessonRecord | null>;
  update: (args: unknown) => Promise<LessonRecord>;
  delete: (args: unknown) => Promise<LessonRecord>;
};

const getLessonDelegate = (): LessonDelegate => {
  const delegate = (prisma as unknown as { lesson?: LessonDelegate }).lesson;
  if (!delegate) {
    throw Object.assign(new Error("Lesson storage is not configured"), {
      status: 500,
    });
  }
  return delegate;
};

const mapContent = (content: LessonRecord["content"]): LessonContent => {
  if (!content || typeof content !== "object") {
    return { version: "1.0.0", blocks: [] };
  }

  return content as LessonContent;
};

const mapToSummary = (lesson: LessonRecord): LessonSummaryDto => ({
  id: lesson.id,
  title: lesson.title,
  description: lesson.description ?? undefined,
  xpReward: lesson.xpReward,
  durationMinutes: lesson.duration ?? null,
  updatedAt: lesson.updatedAt.toISOString(),
});

const mapToDetail = (lesson: LessonRecord): LessonDetailDto => ({
  ...mapToSummary(lesson),
  content: mapContent(lesson.content),
  createdAt: lesson.createdAt.toISOString(),
});

const createLesson = async (
  input: CreateLessonInput
): Promise<LessonDetailDto> => {
  const lessonClient = getLessonDelegate();
  const lesson = await lessonClient.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      xpReward: input.xpReward ?? 15,
      duration: input.durationMinutes ?? null,
      content: normalizeContent(input.content),
    },
  });

  return mapToDetail(lesson);
};

const listLessons = async (query: ListLessonsQuery) => {
  const take = query.limit ?? 20;
  const lessonClient = getLessonDelegate();
  const lessons = await lessonClient.findMany({
    where: query.search
      ? {
          title: { contains: query.search, mode: "insensitive" },
        }
      : undefined,
    orderBy: { updatedAt: "desc" },
    take: take + 1,
    ...(query.cursor
      ? {
          skip: 1,
          cursor: { id: query.cursor },
        }
      : {}),
  });

  const hasMore = lessons.length > take;
  const items = lessons.slice(0, take).map(mapToSummary);

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
  };
};

const getLessonById = async (id: string) => {
  const lessonClient = getLessonDelegate();
  const lesson = await lessonClient.findUnique({ where: { id } });
  if (!lesson) return null;
  return mapToDetail(lesson);
};

const updateLesson = async (
  id: string,
  input: UpdateLessonInput
): Promise<LessonDetailDto> => {
  const lessonClient = getLessonDelegate();

  const data: Record<string, unknown> = {};
  if (typeof input.title === "string") data.title = input.title;
  if (typeof input.description !== "undefined")
    data.description = input.description ?? null;
  if (typeof input.xpReward === "number") data.xpReward = input.xpReward;
  if (typeof input.durationMinutes !== "undefined")
    data.duration = input.durationMinutes ?? null;
  if (input.content) data.content = normalizeContent(input.content);

  const lesson = await lessonClient.update({
    where: { id },
    data,
  });

  return mapToDetail(lesson);
};

const deleteLesson = async (id: string): Promise<void> => {
  const lessonClient = getLessonDelegate();
  await lessonClient.delete({ where: { id } });
};

const normalizeBlock = (
  block: LessonContentBlockInput,
  index: number
): LessonContentBlockInput => {
  const id = block.id || `${block.type}-${index + 1}`;
  if (block.type === "quiz") {
    const options = block.options.length ? block.options : [""];
    const boundedCorrect = Math.min(
      Math.max(0, block.correctOption),
      options.length - 1
    );
    return {
      ...block,
      id,
      options,
      correctOption: boundedCorrect,
    };
  }
  return { ...block, id };
};

const normalizeContent = (content: LessonContentInput): LessonContentInput => {
  const version = content.version ?? "1.0.0";
  return {
    ...content,
    version,
    blocks: content.blocks.map((block, index) => normalizeBlock(block, index)),
  };
};

export const lessonsService = {
  createLesson,
  listLessons,
  getLessonById,
  updateLesson,
  deleteLesson,
};
