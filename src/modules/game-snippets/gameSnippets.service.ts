import { prisma } from '../../shared/prisma/prismaClient';

const normalizePhrase = (value: string) => value.replace(/[,.!?]/g, '');

const countWords = (value: string) =>
  normalizePhrase(value)
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean).length;

const tokenizeTranslation = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/gi)
    .map((token) => token.trim())
    .filter(Boolean);

const shuffleItems = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const buildWordCountOptions = (wordCount: number, total = 3) => {
  const options = new Set<number>([wordCount]);
  const offsets = shuffleItems([1, -1, 2, -2, 3, -3]);
  for (const offset of offsets) {
    if (options.size >= total) break;
    const candidate = wordCount + offset;
    if (candidate > 0) options.add(candidate);
  }
  let fallback = 1;
  while (options.size < total) {
    if (!options.has(fallback)) options.add(fallback);
    fallback += 1;
  }
  return shuffleItems(Array.from(options));
};

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
  listActiveGame: async (filters?: { limit?: number; minWords?: number }) => {
    const take = filters?.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const minWords = filters?.minWords && filters.minWords > 0 ? filters.minWords : 1;
    const pool = await prisma.gameSnippet.findMany({
      where: { isActive: true, isApproved: true, translation: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { content: { select: { videoUrl: true, videoName: true } } },
    });
    const enriched = pool.map((item) => {
      const wordCount = countWords(item.phrase);
      return {
        id: item.id,
        phrase: item.phrase,
        translation: item.translation ?? null,
        contentId: item.contentId,
        startSeconds: item.startSeconds,
        endSeconds: item.endSeconds,
        isActive: item.isActive,
        isApproved: item.isApproved,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        videoUrl: item.content.videoUrl ?? null,
        videoName: item.content.videoName ?? null,
        wordCount,
      };
    });

    const poolWithTranslations = enriched.filter((item) => item.translation);
    const withTokens = poolWithTranslations.map((item) => ({
      ...item,
      translationTokens: tokenizeTranslation(item.translation ?? ''),
    }));

    const candidates = shuffleItems(
      withTokens.filter((item) => item.wordCount >= minWords),
    ).slice(0, take);

    const items = candidates.map((item) => {
      const translationTokens = item.translationTokens;
      const scored = withTokens
        .filter((candidate) => candidate.id !== item.id)
        .map((candidate) => {
          const overlap = candidate.translationTokens.some((token) =>
            translationTokens.includes(token),
          );
          return {
            candidate,
            overlap,
            diff: Math.abs(candidate.wordCount - item.wordCount),
          };
        });

      const prioritized = [
        scored.filter((entry) => entry.overlap && entry.diff <= 1),
        scored.filter((entry) => entry.overlap && entry.diff <= 2),
        scored.filter((entry) => entry.diff <= 1),
        scored.filter((entry) => entry.diff <= 2),
        scored,
      ];

      const translationOptions: string[] = [];
      for (const group of prioritized) {
        for (const entry of shuffleItems(group)) {
          if (translationOptions.length >= 2) break;
          const value = entry.candidate.translation;
          if (!value || value === item.translation) continue;
          if (!translationOptions.includes(value)) translationOptions.push(value);
        }
        if (translationOptions.length >= 2) break;
      }
      if (translationOptions.length < 2) {
        for (const entry of shuffleItems(scored)) {
          if (translationOptions.length >= 2) break;
          const value = entry.candidate.translation;
          if (!value || value === item.translation) continue;
          if (!translationOptions.includes(value)) translationOptions.push(value);
        }
      }

      const options = shuffleItems([
        item.translation ?? '',
        ...translationOptions,
      ]).filter(Boolean);

      return {
        id: item.id,
        phrase: item.phrase,
        translation: item.translation,
        contentId: item.contentId,
        startSeconds: item.startSeconds,
        endSeconds: item.endSeconds,
        videoUrl: item.videoUrl,
        videoName: item.videoName,
        wordCount: item.wordCount,
        wordCountOptions: buildWordCountOptions(item.wordCount),
        translationOptions: options,
      };
    });

    return items;
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
