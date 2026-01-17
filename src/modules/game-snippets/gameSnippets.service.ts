import { prisma } from '../../shared/prisma/prismaClient';

type CreateGameSnippetInput = {
  phrase: string;
  contentId: number;
  startSeconds: number;
  endSeconds: number;
};

type UpdateGameSnippetInput = {
  phrase?: string;
  startSeconds?: number;
  endSeconds?: number;
  isActive?: boolean;
};

export const gameSnippetsService = {
  list: async () => {
    const items = await prisma.gameSnippet.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        content: { select: { videoUrl: true, videoName: true } },
      },
    });
    return items.map((item) => ({
      id: item.id,
      phrase: item.phrase,
      contentId: item.contentId,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      isActive: item.isActive,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      videoUrl: item.content.videoUrl ?? null,
      videoName: item.content.videoName ?? null,
    }));
  },

  create: async (input: CreateGameSnippetInput) => {
    const item = await prisma.gameSnippet.create({
      data: {
        phrase: input.phrase,
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
      contentId: item.contentId,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      isActive: item.isActive,
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
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        isActive: input.isActive,
      },
      include: {
        content: { select: { videoUrl: true, videoName: true } },
      },
    });
    return {
      id: item.id,
      phrase: item.phrase,
      contentId: item.contentId,
      startSeconds: item.startSeconds,
      endSeconds: item.endSeconds,
      isActive: item.isActive,
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
