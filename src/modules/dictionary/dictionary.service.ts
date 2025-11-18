import { prisma } from '../../shared/prisma/prismaClient';
import type { CreateUserWordInput } from './dictionary.schemas';

export const dictionaryService = {
  async list(userId: string, limit?: number, offset?: number) {
    console.log('[DictionaryService] Querying database for userId:', userId);

    // CRITICAL FIX: Add pagination to prevent loading 10,000+ words at once
    const take = limit && limit > 0 ? Math.min(limit, 500) : 100; // Default 100, max 500
    const skip = offset && offset > 0 ? offset : 0;

    const result = await prisma.userWord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
    console.log('[DictionaryService] Query result count:', result.length);
    return result;
  },

  async create(userId: string, payload: CreateUserWordInput) {
    return prisma.userWord.create({
      data: {
        userId,
        word: payload.word,
        translation: payload.translation,
        transcription: payload.transcription,
        partOfSpeech: payload.partOfSpeech,
        audioUrl: payload.audioUrl,
        sourceLang: payload.sourceLang ?? 'en',
        targetLang: payload.targetLang ?? 'ru',
      },
    });
  },

  async remove(userId: string, id: string) {
    const result = await prisma.userWord.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  },
};

