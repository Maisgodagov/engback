import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma/prismaClient';
import type { CreateUserPhraseInput, CreateUserWordInput, RecordDictionaryViewInput } from './dictionary.schemas';
import { buildYandexEntries, muellerService, type YandexDictResponse } from '../mueller/mueller.service';

type DictionaryEntryResponse = {
  id: string;
  word: string;
  translation: string;
  otherTranslations: string[];
  createdAt: Date;
  updatedAt: Date;
};

type PhraseEntryResponse = {
  id: string;
  phrase: string;
  translation: string;
  createdAt: Date;
  updatedAt: Date;
};

const PHRASE_TRANSLATION_TTL_MS = 1000 * 60 * 60 * 24;
const phraseTranslationCache = new Map<string, { value: string; expiresAt: number }>();
const normalizeCacheKey = (text: string) => text.trim().toLowerCase();
const YANDEX_TRANSLATE_API_KEY = process.env.YANDEX_TRANSLATE_API_KEY ?? '';
const YANDEX_TRANSLATE_FOLDER_ID = process.env.YANDEX_TRANSLATE_FOLDER_ID ?? '';

type YandexTranslateResponse = {
  translations?: Array<{ text?: string; detectedLanguageCode?: string }>;
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
  async translatePhrase(text: string, from = 'en', to = 'ru'): Promise<string> {
    const normalizedText = text.trim();
    if (!normalizedText) {
      throw Object.assign(new Error('Text is required'), { status: 400 });
    }
    if (!YANDEX_TRANSLATE_API_KEY) {
      throw Object.assign(new Error('Yandex Translate API key is not configured'), { status: 500 });
    }
    if (!YANDEX_TRANSLATE_FOLDER_ID) {
      throw Object.assign(new Error('Yandex Translate folder ID is not configured'), { status: 500 });
    }
    const cacheKey = `${from}|${to}|${normalizeCacheKey(normalizedText)}`;
    const cached = phraseTranslationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }
    const cachedDb = await prisma.phraseTranslationCache.findUnique({
      where: {
        query_sourceLang_targetLang: {
          query: normalizedText,
          sourceLang: from,
          targetLang: to,
        },
      },
    });
    if (cachedDb?.translation) {
      phraseTranslationCache.set(cacheKey, {
        value: cachedDb.translation,
        expiresAt: Date.now() + PHRASE_TRANSLATION_TTL_MS,
      });
      return cachedDb.translation;
    }

    const response = await fetch(
      'https://translate.api.cloud.yandex.net/translate/v2/translate',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Api-Key ${YANDEX_TRANSLATE_API_KEY}`,
        },
        body: JSON.stringify({
          folderId: YANDEX_TRANSLATE_FOLDER_ID,
          sourceLanguageCode: from,
          targetLanguageCode: to,
          texts: [normalizedText],
        }),
      },
    );
    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        // ignore error body read errors
      }
      console.error('[YandexTranslate] error response', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw Object.assign(
        new Error(`Yandex Translate error: ${response.status} ${response.statusText}`),
        { status: 502 },
      );
    }
    const data = (await response.json()) as YandexTranslateResponse;
    const translatedText = data.translations?.[0]?.text?.trim() ?? '';

    if (translatedText) {
      await prisma.phraseTranslationCache.upsert({
        where: {
          query_sourceLang_targetLang: {
            query: normalizedText,
            sourceLang: from,
            targetLang: to,
          },
        },
        update: {
          translation: translatedText,
        },
        create: {
          query: normalizedText,
          sourceLang: from,
          targetLang: to,
          translation: translatedText,
        },
      });
      phraseTranslationCache.set(cacheKey, {
        value: translatedText,
        expiresAt: Date.now() + PHRASE_TRANSLATION_TTL_MS,
      });
    }
    return translatedText;
  },
  async list(userId: string, limit?: number, offset?: number) {
    // Unified pagination across words + phrases
    const take = limit && limit > 0 ? Math.min(limit, 500) : 100; // Default 100, max 500
    const skip = offset && offset > 0 ? offset : 0;

    const rows = await prisma.$queryRaw<
      Array<{ id: string; type: "word" | "phrase"; createdAt: Date }>
    >(Prisma.sql`
      SELECT id, 'word' AS type, createdAt AS createdAt
      FROM user_words
      WHERE user_id = ${userId}
      UNION ALL
      SELECT id, 'phrase' AS type, createdAt AS createdAt
      FROM user_phrases
      WHERE user_id = ${userId}
      ORDER BY createdAt DESC
      LIMIT ${take} OFFSET ${skip}
    `);

    if (!rows.length) return [];

    const wordIds = rows.filter((row) => row.type === "word").map((row) => row.id);
    const phraseIds = rows.filter((row) => row.type === "phrase").map((row) => row.id);

    const [wordRows, phraseRows] = await Promise.all([
      wordIds.length
        ? prisma.userWord.findMany({
            where: { id: { in: wordIds }, userId },
            include: { yandexCache: true },
          })
        : Promise.resolve([]),
      phraseIds.length
        ? prisma.userPhrase.findMany({
            where: { id: { in: phraseIds }, userId },
          })
        : Promise.resolve([]),
    ]);

    const wordMap = new Map(
      wordRows.map((entry) => [
        entry.id,
        {
          type: "word" as const,
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
        } as DictionaryEntryResponse & { type: "word" },
      ]),
    );

    const phraseMap = new Map(
      phraseRows.map((entry) => [
        entry.id,
        {
          type: "phrase" as const,
          id: entry.id,
          phrase: entry.phrase,
          translation: entry.translation,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        } as PhraseEntryResponse & { type: "phrase" },
      ]),
    );

    return rows
      .map((row) => (row.type === "word" ? wordMap.get(row.id) : phraseMap.get(row.id)))
      .filter(Boolean) as Array<
      (DictionaryEntryResponse & { type: "word" }) | (PhraseEntryResponse & { type: "phrase" })
    >;
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

  async createPhrase(userId: string, payload: CreateUserPhraseInput) {
    const query = payload.query.trim();
    const lang = payload.lang === 'ru' ? 'ru' : 'en';

    if (!query) {
      throw Object.assign(new Error('Query is required'), { status: 400 });
    }

    const targetLang = lang === 'ru' ? 'en' : 'ru';
    const translation = await dictionaryService.translatePhrase(query, lang, targetLang);
    if (!translation) {
      throw Object.assign(new Error('Phrase translation not found'), { status: 404 });
    }

    const cacheRow = await prisma.phraseTranslationCache.findUnique({
      where: {
        query_sourceLang_targetLang: {
          query,
          sourceLang: lang,
          targetLang,
        },
      },
    });

    const phrase = lang === 'ru' ? translation : query;
    const phraseTranslation = lang === 'ru' ? query : translation;

    const existing = await prisma.userPhrase.findFirst({
      where: {
        userId,
        phrase,
        translation: phraseTranslation,
      },
    });
    if (existing) {
      return {
        id: existing.id,
        phrase: existing.phrase,
        translation: existing.translation,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      } as PhraseEntryResponse;
    }

    const created = await prisma.userPhrase.create({
      data: {
        userId,
        phrase,
        translation: phraseTranslation,
        phraseCacheId: cacheRow?.id ?? null,
      },
    });

    return {
      id: created.id,
      phrase: created.phrase,
      translation: created.translation,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    } as PhraseEntryResponse;
  },

  async remove(userId: string, id: string) {
    const result = await prisma.userWord.deleteMany({
      where: { id, userId },
    });
    return result.count > 0;
  },

  async removePhrase(userId: string, id: string) {
    const result = await prisma.userPhrase.deleteMany({
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

  async getStatsWords(
    userId: string,
    status: 'learning' | 'known' | 'viewed',
    limit = 50,
    offset = 0,
  ) {
    const take = Math.max(1, Math.min(limit, 200));
    const skip = Math.max(0, offset);
    if (status === 'viewed') {
      const views = await prisma.userDictionaryView.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
      });
      return views.map((view) => ({
        id: view.id,
        query: view.query,
        lang: view.lang as 'en' | 'ru',
        word: view.word,
        translation: view.translation,
        otherTranslations: [],
        touchesTotal: null,
        touchesCorrect: null,
        touchesIncorrect: null,
      }));
    }

    const progressRows = await prisma.$queryRaw<
      Array<{
        id: number;
        query: string;
        lang: string;
        response: unknown;
        touches_total: number | null;
        touches_correct: number | null;
      }>
    >(Prisma.sql`
      SELECT ydc.id, ydc.query, ydc.lang, ydc.response, uwp.touches_total, uwp.touches_correct
      FROM user_word_progress uwp
      INNER JOIN yandex_dictionary_cache ydc ON ydc.id = uwp.word_id
      WHERE uwp.user_id = ${userId} AND uwp.status = ${status}
      ORDER BY uwp.updated_at DESC
      LIMIT ${take} OFFSET ${skip}
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
          touchesTotal: Number(row.touches_total ?? 0),
          touchesCorrect: Number(row.touches_correct ?? 0),
          touchesIncorrect: Math.max(
            0,
            Number(row.touches_total ?? 0) - Number(row.touches_correct ?? 0),
          ),
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      query: string;
      lang: 'en' | 'ru';
      word: string;
      translation: string;
      otherTranslations: string[];
      touchesTotal: number | null;
      touchesCorrect: number | null;
      touchesIncorrect: number | null;
    }>;
  },
};

