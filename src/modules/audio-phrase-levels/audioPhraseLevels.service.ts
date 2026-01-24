import { prisma } from '../../shared/prisma/prismaClient';
export type CreateAudioPhraseLevelInput = {
  order: number;
  xpReward: number;
  isActive?: boolean;
  snippetIds: string[];
};

export type UpdateAudioPhraseLevelInput = {
  order?: number;
  xpReward?: number;
  isActive?: boolean;
  snippetIds?: string[];
};

export type RecordAudioPhraseProgressInput = {
  snippetId: string;
  exerciseType: 'MISSING' | 'ASSEMBLE' | 'ODDWORD' | 'TRANSLATE';
  isCorrect: boolean;
};

const buildSnippetPayload = (snippetIds: string[]) =>
  snippetIds.map((snippetId, index) => ({
    snippetId,
    order: index + 1,
  }));

export const audioPhraseLevelsService = {
  listAdmin: async () => {
    const levels = await prisma.audioPhraseLevel.findMany({
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { levelSnippets: true } },
      },
    });
    return levels.map((level) => ({
      id: level.id,
      order: level.order,
      xpReward: level.xpReward,
      isActive: level.isActive,
      createdAt: level.createdAt,
      updatedAt: level.updatedAt,
      snippetCount: level._count.levelSnippets,
    }));
  },

  listPublic: async (userId?: string | null) => {
    const levels = await prisma.audioPhraseLevel.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { levelSnippets: true } },
      },
    });

    let progressMap: Record<string, { status: string; completedAt: Date | null }> = {};
    if (userId) {
      const progress = await prisma.userAudioPhraseLevelProgress.findMany({
        where: { userId },
        select: { levelId: true, status: true, completedAt: true },
      });
      progressMap = progress.reduce((acc: Record<string, { status: string; completedAt: Date | null }>, item) => {
        acc[item.levelId] = {
          status: item.status,
          completedAt: item.completedAt ?? null,
        };
        return acc;
      }, {} as Record<string, { status: string; completedAt: Date | null }>);
    }

    return levels.map((level) => ({
      id: level.id,
      order: level.order,
      xpReward: level.xpReward,
      isActive: level.isActive,
      snippetCount: level._count.levelSnippets,
      progress: progressMap[level.id] ?? null,
    }));
  },

  getByIdAdmin: async (id: string) => {
    return prisma.audioPhraseLevel.findUnique({
      where: { id },
      include: {
        levelSnippets: {
          orderBy: { order: 'asc' },
          include: {
            snippet: {
              include: { content: { select: { videoUrl: true, videoName: true } } },
            },
          },
        },
      },
    });
  },

  getByIdPublic: async (id: string) => {
    return prisma.audioPhraseLevel.findFirst({
      where: { id, isActive: true },
      include: {
        levelSnippets: {
          orderBy: { order: 'asc' },
          include: {
            snippet: {
              include: { content: { select: { videoUrl: true, videoName: true } } },
            },
          },
        },
      },
    });
  },

  create: async (input: CreateAudioPhraseLevelInput) => {
    return prisma.audioPhraseLevel.create({
      data: {
        order: input.order,
        xpReward: input.xpReward,
        isActive: input.isActive ?? true,
        levelSnippets: {
          createMany: {
            data: buildSnippetPayload(input.snippetIds),
          },
        },
      },
    });
  },

  update: async (id: string, input: UpdateAudioPhraseLevelInput) => {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.audioPhraseLevel.update({
        where: { id },
        data: {
          order: input.order,
          xpReward: input.xpReward,
          isActive: input.isActive,
        },
      });

      if (input.snippetIds) {
        await tx.audioPhraseLevelSnippet.deleteMany({
          where: { levelId: id },
        });
        await tx.audioPhraseLevelSnippet.createMany({
          data: buildSnippetPayload(input.snippetIds).map((item) => ({
            ...item,
            levelId: id,
          })),
        });
      }

      return updated;
    });
  },

  remove: async (id: string) => {
    await prisma.audioPhraseLevel.delete({ where: { id } });
  },

  listApprovedSnippetsWithLevels: async () => {
    const snippets = await prisma.gameSnippet.findMany({
      where: { isApproved: true, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        content: { select: { videoUrl: true, videoName: true } },
        audioPhraseLevelSnippets: { include: { level: true } },
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
      levelOrders: snippet.audioPhraseLevelSnippets
        .map((entry: { level: { order: number } }) => entry.level.order)
        .sort((a: number, b: number) => a - b),
    }));
  },

  recordProgress: async (userId: string, levelId: string, input: RecordAudioPhraseProgressInput) => {
    return prisma.$transaction(async (tx) => {
      await tx.userAudioPhraseSnippetProgress.upsert({
        where: {
          userId_levelId_snippetId_exerciseType: {
            userId,
            levelId,
            snippetId: input.snippetId,
            exerciseType: input.exerciseType,
          },
        },
        update: { isCorrect: input.isCorrect },
        create: {
          userId,
          levelId,
          snippetId: input.snippetId,
          exerciseType: input.exerciseType,
          isCorrect: input.isCorrect,
        },
      });

      const level = await tx.audioPhraseLevel.findUnique({
        where: { id: levelId },
        include: { levelSnippets: { select: { snippetId: true } } },
      });

      if (!level) return { completed: false, xpReward: 0 };

      const snippetIds = level.levelSnippets.map((entry: { snippetId: string }) => entry.snippetId);
      const progress = await tx.userAudioPhraseSnippetProgress.findMany({
        where: { userId, levelId, snippetId: { in: snippetIds } },
        select: { snippetId: true, isCorrect: true },
      });

      const completedSnippetIds = new Set(progress.map((entry: { snippetId: string }) => entry.snippetId));
      const isCompleted = snippetIds.length > 0 && completedSnippetIds.size >= snippetIds.length;

      const existingProgress = await tx.userAudioPhraseLevelProgress.findUnique({
        where: { userId_levelId: { userId, levelId } },
      });

      if (!existingProgress) {
        await tx.userAudioPhraseLevelProgress.create({
          data: {
            userId,
            levelId,
            status: isCompleted ? 'COMPLETED' : 'IN_PROGRESS',
            startedAt: new Date(),
            completedAt: isCompleted ? new Date() : null,
          },
        });
      } else if (isCompleted && existingProgress.status !== 'COMPLETED') {
        await tx.userAudioPhraseLevelProgress.update({
          where: { id: existingProgress.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      } else if (existingProgress.status === 'NOT_STARTED') {
        await tx.userAudioPhraseLevelProgress.update({
          where: { id: existingProgress.id },
          data: { status: 'IN_PROGRESS', startedAt: new Date() },
        });
      }

      let xpAwarded = 0;
      if (isCompleted && existingProgress?.status !== 'COMPLETED') {
        await tx.user.update({
          where: { id: userId },
          data: { xpPoints: { increment: level.xpReward } },
        });
        xpAwarded = level.xpReward;
      }

      return { completed: isCompleted, xpReward: xpAwarded };
    });
  },
};

