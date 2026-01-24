import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma/prismaClient';

export type LearningPathModuleInput = {
  orderIndex: number;
  title: string;
  levelTag?: string | null;
  releaseStatus?: string | null;
  isActive?: boolean;
};

export type LearningPathLessonInput = {
  moduleId: string;
  orderIndex: number;
  phraseTextEn: string;
  phraseTextRu?: string | null;
  difficultyTag?: string | null;
  xpReward?: number;
  mainSnippetId: string;
  altSnippetIds?: string[];
  targetWords?: string[];
};

export type LearningPathLessonUpdateInput = Partial<LearningPathLessonInput>;

const buildAltSnippetPayload = (lessonId: string, snippetIds: string[]) =>
  snippetIds.map((snippetId, index) => ({
    lessonId,
    snippetId,
    order: index + 1,
  }));

const mapSnippet = (snippet: {
  id: string;
  phrase: string;
  translation: string | null;
  contentId: number;
  startSeconds: number;
  endSeconds: number;
  content?: { videoUrl: string | null; videoName: string | null } | null;
}) => ({
  id: snippet.id,
  phrase: snippet.phrase,
  translation: snippet.translation,
  contentId: snippet.contentId,
  startSeconds: snippet.startSeconds,
  endSeconds: snippet.endSeconds,
  videoUrl: snippet.content?.videoUrl ?? null,
  videoName: snippet.content?.videoName ?? null,
});

const normalizeTargetWords = (words?: string[]) =>
  words?.map((word) => word.trim()).filter(Boolean) ?? [];

const computeModuleStatus = (
  completedLessons: number,
  totalLessons: number,
  hasInProgress: boolean,
  unlocked: boolean,
) => {
  if (!unlocked) return 'LOCKED' as const;
  if (totalLessons > 0 && completedLessons >= totalLessons) return 'COMPLETED' as const;
  if (completedLessons > 0 || hasInProgress) return 'IN_PROGRESS' as const;
  return 'IN_PROGRESS' as const;
};

export const learningPathService = {
  listModulesAdmin: async () => {
    const modules = await prisma.learningPathModule.findMany({
      orderBy: { orderIndex: 'asc' },
      include: { _count: { select: { lessons: true } } },
    });

    return modules.map((module) => ({
      id: module.id,
      orderIndex: module.orderIndex,
      title: module.title,
      levelTag: module.levelTag,
      releaseStatus: module.releaseStatus,
      isActive: module.isActive,
      lessonCount: module._count.lessons,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
    }));
  },

  createModule: async (input: LearningPathModuleInput) => {
    return prisma.learningPathModule.create({
      data: {
        orderIndex: input.orderIndex,
        title: input.title,
        levelTag: input.levelTag ?? null,
        releaseStatus: input.releaseStatus ?? null,
        isActive: input.isActive ?? true,
      },
    });
  },

  updateModule: async (id: string, input: Partial<LearningPathModuleInput>) => {
    return prisma.learningPathModule.update({
      where: { id },
      data: {
        orderIndex: input.orderIndex,
        title: input.title,
        levelTag: input.levelTag ?? undefined,
        releaseStatus: input.releaseStatus ?? undefined,
        isActive: input.isActive,
      },
    });
  },

  removeModule: async (id: string) => {
    await prisma.learningPathModule.delete({ where: { id } });
  },

  listLessonsAdmin: async (moduleId?: string) => {
    const lessons = await prisma.learningPathLesson.findMany({
      where: moduleId ? { moduleId } : undefined,
      orderBy: [{ moduleId: 'asc' }, { orderIndex: 'asc' }],
      include: {
        module: { select: { title: true, orderIndex: true } },
        mainSnippet: { include: { content: { select: { videoUrl: true, videoName: true } } } },
        altSnippets: { include: { snippet: { include: { content: { select: { videoUrl: true, videoName: true } } } } }, orderBy: { order: 'asc' } },
      },
    });

    return lessons.map((lesson) => ({
      id: lesson.id,
      moduleId: lesson.moduleId,
      moduleTitle: lesson.module.title,
      moduleOrderIndex: lesson.module.orderIndex,
      orderIndex: lesson.orderIndex,
      phraseTextEn: lesson.phraseTextEn,
      phraseTextRu: lesson.phraseTextRu,
      difficultyTag: lesson.difficultyTag,
      xpReward: lesson.xpReward,
      mainSnippet: mapSnippet(lesson.mainSnippet),
      altSnippets: lesson.altSnippets.map((entry) => mapSnippet(entry.snippet)),
      targetWords: (lesson.targetWords as string[] | null) ?? [],
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    }));
  },

  getLessonAdmin: async (id: string) => {
    const lesson = await prisma.learningPathLesson.findUnique({
      where: { id },
      include: {
        module: { select: { title: true, orderIndex: true } },
        mainSnippet: { include: { content: { select: { videoUrl: true, videoName: true } } } },
        altSnippets: { include: { snippet: { include: { content: { select: { videoUrl: true, videoName: true } } } } }, orderBy: { order: 'asc' } },
      },
    });
    if (!lesson) return null;
    return {
      ...lesson,
      mainSnippet: mapSnippet(lesson.mainSnippet),
      altSnippets: lesson.altSnippets.map((entry) => ({
        ...entry,
        snippet: mapSnippet(entry.snippet),
      })),
    };
  },

  createLesson: async (input: LearningPathLessonInput) => {
    const targetWords = normalizeTargetWords(input.targetWords);

    return prisma.$transaction(async (tx) => {
      const lesson = await tx.learningPathLesson.create({
        data: {
          moduleId: input.moduleId,
          orderIndex: input.orderIndex,
          phraseTextEn: input.phraseTextEn,
          phraseTextRu: input.phraseTextRu ?? null,
          difficultyTag: input.difficultyTag ?? null,
          xpReward: input.xpReward ?? 25,
          mainSnippetId: input.mainSnippetId,
          targetWords: targetWords.length ? targetWords : undefined,
        },
      });

      if (input.altSnippetIds?.length) {
        await tx.learningPathLessonAltSnippet.createMany({
          data: buildAltSnippetPayload(lesson.id, input.altSnippetIds),
        });
      }

      return lesson;
    });
  },

  updateLesson: async (id: string, input: LearningPathLessonUpdateInput) => {
    const targetWords = input.targetWords ? normalizeTargetWords(input.targetWords) : undefined;

    return prisma.$transaction(async (tx) => {
      const updated = await tx.learningPathLesson.update({
        where: { id },
        data: {
          moduleId: input.moduleId,
          orderIndex: input.orderIndex,
          phraseTextEn: input.phraseTextEn,
          phraseTextRu: input.phraseTextRu ?? undefined,
          difficultyTag: input.difficultyTag ?? undefined,
          xpReward: input.xpReward,
          mainSnippetId: input.mainSnippetId,
          targetWords: targetWords ? (targetWords.length ? targetWords : []) : undefined,
        },
      });

      if (input.altSnippetIds) {
        await tx.learningPathLessonAltSnippet.deleteMany({
          where: { lessonId: id },
        });
        if (input.altSnippetIds.length) {
          await tx.learningPathLessonAltSnippet.createMany({
            data: buildAltSnippetPayload(id, input.altSnippetIds),
          });
        }
      }

      return updated;
    });
  },

  removeLesson: async (id: string) => {
    await prisma.learningPathLesson.delete({ where: { id } });
  },

  searchSnippets: async (query: string) => {
    const trimmed = query.trim();
    const where = trimmed
      ? {
          isApproved: true,
          isActive: true,
          phrase: { contains: trimmed },
        }
      : {
          isApproved: true,
          isActive: true,
        };

    const snippets = await prisma.gameSnippet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        content: { select: { videoUrl: true, videoName: true } },
      },
    });

    return snippets.map((snippet) => ({
      id: snippet.id,
      phrase: snippet.phrase,
      translation: snippet.translation,
      contentId: snippet.contentId,
      startSeconds: snippet.startSeconds,
      endSeconds: snippet.endSeconds,
      videoUrl: snippet.content.videoUrl ?? null,
      videoName: snippet.content.videoName ?? null,
    }));
  },

  importSnippet: async (input: {
    contentId: number;
    startSeconds: number;
    endSeconds: number;
    phrase: string;
    translation?: string | null;
  }) => {
    const existing = await prisma.gameSnippet.findFirst({
      where: {
        contentId: input.contentId,
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        phrase: input.phrase,
      },
      include: { content: { select: { videoUrl: true, videoName: true } } },
    });
    if (existing) return mapSnippet(existing);

    const created = await prisma.gameSnippet.create({
      data: {
        contentId: input.contentId,
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        phrase: input.phrase,
        translation: input.translation ?? null,
        isApproved: true,
        isActive: true,
      },
      include: { content: { select: { videoUrl: true, videoName: true } } },
    });

    return mapSnippet(created);
  },

  listPathForUser: async (userId?: string | null) => {
    const modules = await prisma.learningPathModule.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' },
      include: {
        lessons: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            phraseTextEn: true,
            phraseTextRu: true,
          },
        },
      },
    });

    if (!userId) {
      return modules.map((module) => ({
        id: module.id,
        orderIndex: module.orderIndex,
        title: module.title,
        levelTag: module.levelTag,
        isActive: module.isActive,
        status: 'LOCKED',
        completedLessonsCount: 0,
        totalLessons: module.lessons.length,
        lessons: module.lessons.map((lesson) => ({
          id: lesson.id,
          orderIndex: lesson.orderIndex,
          phraseTextEn: lesson.phraseTextEn,
          phraseTextRu: lesson.phraseTextRu,
          status: 'LOCKED',
        })),
      }));
    }

    const lessonIds = modules.flatMap((module) => module.lessons.map((lesson) => lesson.id));
    const progress = await prisma.learningPathLessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: lessonIds },
      },
      select: { lessonId: true, status: true, lastStepIndex: true },
    });
    const progressMap = progress.reduce<Record<string, { status: string; lastStepIndex: number | null }>>(
      (acc, item) => {
        acc[item.lessonId] = {
          status: item.status,
          lastStepIndex: item.lastStepIndex ?? null,
        };
        return acc;
      },
      {},
    );

    let unlocked = true;

    return modules.map((module) => {
      const lessonStatuses = module.lessons.map((lesson) => progressMap[lesson.id]?.status ?? 'NOT_STARTED');
      const completedLessons = lessonStatuses.filter((status) => status === 'COMPLETED').length;
      const hasInProgress = lessonStatuses.some((status) => status === 'IN_PROGRESS');
      const status = computeModuleStatus(completedLessons, module.lessons.length, hasInProgress, unlocked);
      if (status === 'COMPLETED') {
        unlocked = true;
      } else {
        unlocked = false;
      }

      return {
        id: module.id,
        orderIndex: module.orderIndex,
        title: module.title,
        levelTag: module.levelTag,
        isActive: module.isActive,
        status,
        completedLessonsCount: completedLessons,
        totalLessons: module.lessons.length,
        lessons: module.lessons.map((lesson) => ({
          id: lesson.id,
          orderIndex: lesson.orderIndex,
          phraseTextEn: lesson.phraseTextEn,
          phraseTextRu: lesson.phraseTextRu,
          status: progressMap[lesson.id]?.status ?? 'NOT_STARTED',
          lastStepIndex: progressMap[lesson.id]?.lastStepIndex ?? null,
        })),
      };
    });
  },

  getLessonForUser: async (lessonId: string, userId?: string | null) => {
    const lesson = await prisma.learningPathLesson.findUnique({
      where: { id: lessonId },
      include: {
        module: { select: { id: true, title: true, orderIndex: true } },
        mainSnippet: { include: { content: { select: { videoUrl: true, videoName: true } } } },
        altSnippets: { include: { snippet: { include: { content: { select: { videoUrl: true, videoName: true } } } } }, orderBy: { order: 'asc' } },
      },
    });

    if (!lesson) return null;

    const progress = userId
      ? await prisma.learningPathLessonProgress.findUnique({
          where: {
            userId_lessonId: {
              userId,
              lessonId,
            },
          },
          select: { status: true, lastStepIndex: true, attemptsCount: true, completedAt: true },
        })
      : null;

    return {
      id: lesson.id,
      module: lesson.module,
      orderIndex: lesson.orderIndex,
      phraseTextEn: lesson.phraseTextEn,
      phraseTextRu: lesson.phraseTextRu,
      difficultyTag: lesson.difficultyTag,
      xpReward: lesson.xpReward,
      targetWords: (lesson.targetWords as string[] | null) ?? [],
      mainSnippet: mapSnippet(lesson.mainSnippet),
      altSnippets: lesson.altSnippets.map((entry) => mapSnippet(entry.snippet)),
      progress: progress ?? null,
    };
  },

  startLesson: async (lessonId: string, userId: string, lastStepIndex?: number | null) => {
    try {
      return await prisma.learningPathLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: {
          status: 'IN_PROGRESS',
          attemptsCount: { increment: 1 },
          startedAt: new Date(),
          lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
        },
        create: {
          userId,
          lessonId,
          status: 'IN_PROGRESS',
          attemptsCount: 1,
          startedAt: new Date(),
          lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return prisma.learningPathLessonProgress.update({
          where: { userId_lessonId: { userId, lessonId } },
          data: {
            status: 'IN_PROGRESS',
            attemptsCount: { increment: 1 },
            startedAt: new Date(),
            lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
          },
        });
      }
      throw error;
    }
  },

  updateLessonStep: async (lessonId: string, userId: string, lastStepIndex?: number | null) => {
    try {
      return await prisma.learningPathLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: {
          status: 'IN_PROGRESS',
          lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
        },
        create: {
          userId,
          lessonId,
          status: 'IN_PROGRESS',
          attemptsCount: 1,
          startedAt: new Date(),
          lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return prisma.learningPathLessonProgress.update({
          where: { userId_lessonId: { userId, lessonId } },
          data: {
            status: 'IN_PROGRESS',
            lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
          },
        });
      }
      throw error;
    }
  },

  completeLesson: async (lessonId: string, userId: string, lastStepIndex?: number | null) => {
    return prisma.$transaction(async (tx) => {
      const lesson = await tx.learningPathLesson.findUnique({
        where: { id: lessonId },
        select: { id: true, moduleId: true, xpReward: true },
      });

      if (!lesson) {
        return { awardedXp: 0, moduleStatus: null };
      }

      const existing = await tx.learningPathLessonProgress.findUnique({
        where: { userId_lessonId: { userId, lessonId } },
        select: { status: true },
      });

      const shouldAwardXp = existing?.status !== 'COMPLETED';

      await tx.learningPathLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: {
          status: 'COMPLETED',
          completedAt: new Date(),
          lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
        },
        create: {
          userId,
          lessonId,
          status: 'COMPLETED',
          attemptsCount: 1,
          startedAt: new Date(),
          completedAt: new Date(),
          lastStepIndex: typeof lastStepIndex === 'number' ? lastStepIndex : undefined,
        },
      });

      if (shouldAwardXp && lesson.xpReward > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { xpPoints: { increment: lesson.xpReward } },
        });
      }

      const lessonIds = await tx.learningPathLesson.findMany({
        where: { moduleId: lesson.moduleId },
        select: { id: true },
      });
      const completed = await tx.learningPathLessonProgress.count({
        where: {
          userId,
          lessonId: { in: lessonIds.map((entry) => entry.id) },
          status: 'COMPLETED',
        },
      });

      const total = lessonIds.length;
      const moduleStatus = completed >= total && total > 0 ? 'COMPLETED' : 'IN_PROGRESS';

      await tx.learningPathModuleProgress.upsert({
        where: { userId_moduleId: { userId, moduleId: lesson.moduleId } },
        update: {
          status: moduleStatus,
          completedLessonsCount: completed,
          startedAt: moduleStatus === 'IN_PROGRESS' ? new Date() : undefined,
          completedAt: moduleStatus === 'COMPLETED' ? new Date() : null,
        },
        create: {
          userId,
          moduleId: lesson.moduleId,
          status: moduleStatus,
          completedLessonsCount: completed,
          startedAt: new Date(),
          completedAt: moduleStatus === 'COMPLETED' ? new Date() : null,
        },
      });

      return { awardedXp: shouldAwardXp ? lesson.xpReward : 0, moduleStatus };
    });
  },
};
