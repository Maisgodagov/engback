import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma/prismaClient';
import type { CreateUserWordInput, RecordDictionaryViewInput } from './dictionary.schemas';
import { buildYandexEntries, muellerService, type YandexDictResponse } from '../mueller/mueller.service';

type DictionaryEntryResponse = {
  id: string;
  word: string;
  translation: string;
  otherTranslations: string[];
  createdAt: Date;
  updatedAt: Date;
};

const getOtherTranslations = (
  cache: { query: string; lang: string; response: unknown } | null,
  primaryWord: string,
  primaryTranslation: string,
): string[] => {
  if (!cache || !cache.response) return [];
  const lang = cache.lang === 'ru' ? 'ru' : 'en';
  const entries = buildYandexEntries(cache.query, lang, cache.response as YandexDictResponse);
  if (!entries.length) return [];

  if (lang === 'ru') {
    return entries
      .map((entry) => entry.word)
      .filter((value) => value && value !== primaryWord)
      .slice(0, 4);
  }

  const match = entries.find((entry) => entry.word === primaryWord) ?? entries[0];
  return (match?.translations ?? [])
    .filter((value) => value && value !== primaryTranslation)
    .slice(0, 4);
};

const getPrimaryTranslation = (
  cache: { query: string; lang: string; response: unknown } | null,
): { word: string; translation: string; otherTranslations: string[] } | null => {
  if (!cache || !cache.response) return null;
  const lang = cache.lang === 'ru' ? 'ru' : 'en';
  const entries = buildYandexEntries(cache.query, lang, cache.response as YandexDictResponse);
  if (!entries.length) return null;
  const primary = entries[0];
  if (lang === 'ru') {
    return {
      word: primary.word ?? cache.query,
      translation: cache.query,
      otherTranslations: entries.map((entry) => entry.word).filter(Boolean).slice(1, 4),
    };
  }
  const translation = primary.translations.find((value) => value.trim().length > 0) ?? '';
  return {
    word: primary.word ?? cache.query,
    translation,
    otherTranslations: primary.translations
      .filter((value) => value && value !== translation)
      .slice(0, 4),
  };
};

export const dictionaryService = {
  async list(userId: string, limit?: number, offset?: number) {
    // CRITICAL FIX: Add pagination to prevent loading 10,000+ words at once
    const take = limit && limit > 0 ? Math.min(limit, 500) : 100; // Default 100, max 500
    const skip = offset && offset > 0 ? offset : 0;

    const result = await prisma.userWord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { yandexCache: true },
      take,
      skip,
    });
    return result.map((entry) => ({
      id: entry.id,
      word: entry.word,
      translation: entry.translation,
      otherTranslations: getOtherTranslations(
        entry.yandexCache
          ? {
              query: entry.yandexCache.query,
              lang: entry.yandexCache.lang,
              response: entry.yandexCache.response,
            }
          : null,
        entry.word,
        entry.translation,
      ),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    })) as DictionaryEntryResponse[];
  },

  async create(userId: string, payload: CreateUserWordInput) {
    const query = payload.query.trim().toLowerCase();
    const lang = payload.lang;
    const wordOverride = payload.word?.trim();
    const translationOverride = payload.translation?.trim();

    if (!query) {
      throw Object.assign(new Error('Query is required'), { status: 400 });
    }

    let cacheRecord = await prisma.yandexDictionaryCache.findUnique({
      where: { query_lang: { query, lang } },
    });
    let entries: ReturnType<typeof buildYandexEntries> = [];
    if (!cacheRecord) {
      const lookupEntries = await muellerService.lookup(query, lang);
      if (lookupEntries.length > 0) {
        entries = lookupEntries;
      } else {
        cacheRecord = await prisma.yandexDictionaryCache.findUnique({
          where: { query_lang: { query, lang } },
        });
      }
    }
    if (cacheRecord) {
      entries = buildYandexEntries(query, lang, cacheRecord.response as YandexDictResponse);
    }
    if (!entries.length && !(wordOverride && translationOverride)) {
      throw Object.assign(new Error('Dictionary result not found'), { status: 404 });
    }

    const primary = entries[0];
    const primaryWord = wordOverride ?? primary?.word ?? query;
    const primaryTranslation =
      translationOverride ??
      (lang === 'ru'
        ? query
        : primary.translations.find((value) => value.trim().length > 0) ?? '');

    const existing = cacheRecord
      ? await prisma.userWord.findFirst({
          where: { userId, yandexCacheId: cacheRecord.id },
          include: { yandexCache: true },
        })
      : await prisma.userWord.findFirst({
          where: { userId, word: primaryWord, translation: primaryTranslation },
          include: { yandexCache: true },
        });
    if (existing) {
      return {
        id: existing.id,
        word: existing.word,
        translation: existing.translation,
        otherTranslations: getOtherTranslations(
          existing.yandexCache
            ? {
                query: existing.yandexCache.query,
                lang: existing.yandexCache.lang,
                response: existing.yandexCache.response,
              }
            : null,
          existing.word,
          existing.translation,
        ),
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      } as DictionaryEntryResponse;
    }

    const created = await prisma.userWord.create({
      data: {
        userId,
        word: primaryWord,
        translation: primaryTranslation,
        yandexCacheId: cacheRecord?.id ?? null,
        sourceLang: 'en',
        targetLang: 'ru',
      },
      include: { yandexCache: true },
    });
    return {
      id: created.id,
      word: created.word,
      translation: created.translation,
      otherTranslations: getOtherTranslations(
        created.yandexCache
          ? {
              query: created.yandexCache.query,
              lang: created.yandexCache.lang,
              response: created.yandexCache.response,
            }
          : null,
        created.word,
        created.translation,
      ),
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    } as DictionaryEntryResponse;
  },

  async remove(userId: string, id: string) {
    const result = await prisma.userWord.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  },

  async recordView(userId: string, payload: RecordDictionaryViewInput) {
    const query = payload.query.trim().toLowerCase();
    const word = payload.word.trim();
    const translation = payload.translation.trim();
    if (!query || !word || !translation) return;
    await prisma.userDictionaryView.upsert({
      where: { userId_query_lang: { userId, query, lang: payload.lang } },
      update: {
        word,
        translation,
      },
      create: {
        userId,
        query,
        lang: payload.lang,
        word,
        translation,
      },
    });
  },

  async getStats(userId: string) {
    const rows = await prisma.$queryRaw<Array<{ status: string; total: bigint }>>(
      Prisma.sql`
        SELECT status, COUNT(*) AS total
        FROM user_word_progress
        WHERE user_id = ${userId} AND status IN ('learning', 'known')
        GROUP BY status
      `,
    );
    const learningCount =
      Number(rows.find((row) => row.status === 'learning')?.total ?? 0);
    const knownCount = Number(rows.find((row) => row.status === 'known')?.total ?? 0);
    const viewedCount = await prisma.userDictionaryView.count({ where: { userId } });
    return { learningCount, knownCount, viewedCount };
  },

  async getStatsWords(userId: string, status: 'learning' | 'known' | 'viewed') {
    if (status === 'viewed') {
      const views = await prisma.userDictionaryView.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
      return views.map((view) => ({
        id: view.id,
        query: view.query,
        lang: view.lang as 'en' | 'ru',
        word: view.word,
        translation: view.translation,
        otherTranslations: [],
      }));
    }

    const progressRows = await prisma.$queryRaw<
      Array<{ id: number; query: string; lang: string; response: unknown }>
    >(Prisma.sql`
      SELECT ydc.id, ydc.query, ydc.lang, ydc.response
      FROM user_word_progress uwp
      INNER JOIN yandex_dictionary_cache ydc ON ydc.id = uwp.word_id
      WHERE uwp.user_id = ${userId} AND uwp.status = ${status}
      ORDER BY uwp.updated_at DESC
      LIMIT 200
    `);

    return progressRows
      .map((row) => {
        const primary = getPrimaryTranslation({
          query: row.query,
          lang: row.lang,
          response: row.response,
        });
        if (!primary || !primary.translation) return null;
        return {
          id: String(row.id),
          query: row.query,
          lang: (row.lang === 'ru' ? 'ru' : 'en') as 'en' | 'ru',
          word: primary.word,
          translation: primary.translation,
          otherTranslations: primary.otherTranslations,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      query: string;
      lang: 'en' | 'ru';
      word: string;
      translation: string;
      otherTranslations: string[];
    }>;
  },
};

