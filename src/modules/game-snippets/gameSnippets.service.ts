import { prisma } from '../../shared/prisma/prismaClient';

type CreateGameSnippetInput = {
  phrase: string;
  translation?: string | null;
  contentId: number;
  startSeconds: number;
  endSeconds: number;
};

type UpdateGameSnippetInput = {
  phrase?: string;
  translation?: string | null;
  startSeconds?: number;
  endSeconds?: number;
  isActive?: boolean;
  isApproved?: boolean;
};

export const gameSnippetsService = {
  getById: async (id: string) => {
    const item = await prisma.gameSnippet.findUnique({
      where: { id },
      include: {
        content: { select: { videoUrl: true, videoName: true } },
      },
    });
    if (!item) return null;
    return {
      id: item.id,
      phrase: item.phrase,
      translation: item.translation,
      contentId: item.contentId,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      isActive: item.isActive,
      isApproved: item.isApproved,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      videoUrl: item.content.videoUrl ?? null,
      videoName: item.content.videoName ?? null,
    };
  },
  listActive: async (limit?: number) => {
    const take = limit && limit > 0 ? Math.min(limit, 100) : 100;
    const items = await prisma.gameSnippet.findMany({
      where: { isActive: true, isApproved: true },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        content: { select: { videoUrl: true, videoName: true } },
      },
    });
    return items.map((item) => ({
      id: item.id,
      phrase: item.phrase,
      translation: item.translation,
      contentId: item.contentId,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      isActive: item.isActive,
      isApproved: item.isApproved,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      videoUrl: item.content.videoUrl ?? null,
      videoName: item.content.videoName ?? null,
    }));
  },

  list: async (filters?: {
    isApproved?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const where =
      filters?.isApproved !== undefined
        ? { isApproved: filters.isApproved }
        : undefined;
    const take =
      typeof filters?.limit === 'number' && filters.limit > 0
        ? Math.min(filters.limit, 100)
        : undefined;
    const skip =
      typeof filters?.offset === 'number' && filters.offset > 0
        ? filters.offset
        : undefined;
    const [items, total] = await prisma.$transaction([
      prisma.gameSnippet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          content: { select: { videoUrl: true, videoName: true } },
        },
      }),
      prisma.gameSnippet.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        id: item.id,
        phrase: item.phrase,
        translation: item.translation,
        contentId: item.contentId,
        startSeconds: item.startSeconds,
        endSeconds: item.endSeconds,
        isActive: item.isActive,
        isApproved: item.isApproved,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        videoUrl: item.content.videoUrl ?? null,
        videoName: item.content.videoName ?? null,
      })),
      total,
    };
  },

  create: async (input: CreateGameSnippetInput) => {
    const item = await prisma.gameSnippet.create({
      data: {
        phrase: input.phrase,
        translation: input.translation ?? null,
        contentId: input.contentId,
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
      },
      include: {
        content: { select: { videoUrl: true, videoName: true } },
      },
    });
    return {
      id: item.id,
      phrase: item.phrase,
      translation: item.translation,
      contentId: item.contentId,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      isActive: item.isActive,
      isApproved: item.isApproved,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      videoUrl: item.content.videoUrl ?? null,
      videoName: item.content.videoName ?? null,
    };
  },

  update: async (id: string, input: UpdateGameSnippetInput) => {
    const item = await prisma.gameSnippet.update({
      where: { id },
      data: {
        phrase: input.phrase,
        translation: input.translation,
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        isActive: input.isActive,
        isApproved: input.isApproved,
      },
      include: {
        content: { select: { videoUrl: true, videoName: true } },
      },
    });
    return {
      id: item.id,
      phrase: item.phrase,
      translation: item.translation,
      contentId: item.contentId,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      isActive: item.isActive,
      isApproved: item.isApproved,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      videoUrl: item.content.videoUrl ?? null,
      videoName: item.content.videoName ?? null,
    };
  },

  remove: async (id: string) => {
    await prisma.gameSnippet.delete({ where: { id } });
  },
};
