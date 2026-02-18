import { Prisma } from '@prisma/client';
import https from 'https';

import { prisma } from '../../shared/prisma/prismaClient';

export interface MuellerLookupResult {
  id: number;
  word: string;
  partOfSpeech: string | null;
  translations: string[];
  synonyms?: string[];
  cefrLevel?: string | null;
  audioUrl?: string | null;
}

type LookupLang = 'en' | 'ru';

type YandexDictSyn = {
  text?: string;
};

type YandexDictTr = {
  text?: string;
  pos?: string;
  syn?: YandexDictSyn[];
};

type YandexDictDef = {
  text?: string;
  pos?: string;
  tr?: YandexDictTr[];
};

export type YandexDictResponse = {
  def?: YandexDictDef[];
};

const YANDEX_DICTIONARY_API_KEY = process.env.YANDEX_DICTIONARY_API_KEY ?? '';
const YANDEX_DICTIONARY_ENDPOINT =
  'https://dictionary.yandex.net/api/v1/dicservice.json/lookup';
const YANDEX_LOOKUP_FLAGS = 0x0005;

const httpGetJson = async <T>(url: URL): Promise<T> => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      const status = response.statusCode ?? 500;
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (status < 200 || status >= 300) {
          reject(new Error(`Yandex Dictionary API error: ${status} ${body}`));
          return;
        }
        try {
          resolve(JSON.parse(body) as T);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on('error', reject);
    request.end();
  });
};

const uniq = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  return result;
};

const extractYandexTranslations = (response: YandexDictResponse) => {
  const translations: string[] = [];
  (response.def ?? []).forEach((def) => {
    (def.tr ?? []).forEach((tr) => {
      if (tr.text) translations.push(tr.text);
      (tr.syn ?? []).forEach((syn) => {
        if (syn.text) translations.push(syn.text);
      });
    });
  });
  return uniq(translations);
};

const getCefrLevelForQuery = async (query: string): Promise<string | null> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ cefr_level: string | null }>>(Prisma.sql`
      SELECT cefr_level
      FROM yandex_dictionary_cache
      WHERE query = ${query}
        AND lang IN ('en', 'en-en')
        AND cefr_level IS NOT NULL
      ORDER BY CASE WHEN lang = 'en' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    `);
    return rows[0]?.cefr_level ?? null;
  } catch {
    return null;
  }
};

const getPronunciationAudioUrlForQuery = async (
  query: string,
): Promise<string | null> => {
  try {
    const rows = await prisma.$queryRaw<Array<{ audio_url: string | null }>>(Prisma.sql`
      SELECT pronunciation_audio_url AS audio_url
      FROM yandex_dictionary_cache
      WHERE query = ${query}
        AND lang IN ('en', 'en-en')
        AND pronunciation_audio_url IS NOT NULL
        AND TRIM(pronunciation_audio_url) <> ''
      ORDER BY CASE WHEN lang = 'en' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT 1
    `);
    return rows[0]?.audio_url?.trim() ?? null;
  } catch {
    return null;
  }
};

export const buildYandexEntries = (
  input: string,
  lang: LookupLang,
  response: YandexDictResponse,
): MuellerLookupResult[] => {
  const defs = response.def ?? [];
  if (!defs.length) return [];

  if (lang === 'ru') {
    const entries: MuellerLookupResult[] = [];
    const seen = new Set<string>();
    let id = 1;

    defs.forEach((def) => {
      (def.tr ?? []).forEach((tr) => {
        const candidate = tr.text?.trim();
        if (candidate && !seen.has(candidate)) {
          seen.add(candidate);
          entries.push({
            id: id++,
            word: candidate,
            partOfSpeech: tr.pos ?? def.pos ?? null,
            translations: [input],
          });
        }

        (tr.syn ?? []).forEach((syn) => {
          const synWord = syn.text?.trim();
          if (synWord && !seen.has(synWord)) {
            seen.add(synWord);
            entries.push({
              id: id++,
              word: synWord,
              partOfSpeech: tr.pos ?? def.pos ?? null,
              translations: [input],
            });
          }
        });
      });
    });

    return entries.slice(0, 10);
  }

  const translations: string[] = [];
  defs.forEach((def) => {
    (def.tr ?? []).forEach((tr) => {
      if (tr.text) translations.push(tr.text);
      (tr.syn ?? []).forEach((syn) => {
        if (syn.text) translations.push(syn.text);
      });
    });
  });

  const uniqueTranslations = uniq(translations);
  if (!uniqueTranslations.length) return [];

  return [
    {
      id: 1,
      word: defs[0]?.text?.trim() || input,
      partOfSpeech: defs[0]?.pos ?? null,
      translations: uniqueTranslations,
    },
  ];
};

const lookupViaYandex = async (
  word: string,
  cacheLangKey: string,
  apiLang: string,
): Promise<YandexDictResponse | null> => {
  if (!YANDEX_DICTIONARY_API_KEY) {
    return null;
  }

  const normalizedQuery = word.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const cached = await prisma.yandexDictionaryCache.findUnique({
    where: { query_lang: { query: normalizedQuery, lang: cacheLangKey } },
  });
  if (cached?.response) {
    return cached.response as YandexDictResponse;
  }

  const url = new URL(YANDEX_DICTIONARY_ENDPOINT);
  url.searchParams.set('key', YANDEX_DICTIONARY_API_KEY);
  url.searchParams.set('lang', apiLang);
  url.searchParams.set('text', normalizedQuery);
  url.searchParams.set('flags', YANDEX_LOOKUP_FLAGS.toString());

  const response = await httpGetJson<YandexDictResponse>(url);
  if (response.def && response.def.length > 0) {
    await prisma.yandexDictionaryCache.upsert({
      where: { query_lang: { query: normalizedQuery, lang: cacheLangKey } },
      update: { response: response as Prisma.JsonObject },
      create: {
        query: normalizedQuery,
        lang: cacheLangKey,
        response: response as Prisma.JsonObject,
      },
    });
  }
  return response;
};

export const muellerService = {
  /**
   * Ищет слово в словаре Mueller
   * @param word - слово для поиска (регистронезависимо)
   * @returns массив результатов поиска
   */
  async lookup(word: string, lang: LookupLang = 'en'): Promise<MuellerLookupResult[]> {
    const normalized = word.trim().toLowerCase();

    if (!normalized) {
      return [];
    }

    if (YANDEX_DICTIONARY_API_KEY) {
      try {
        const apiLang = lang === 'ru' ? 'ru-en' : 'en-ru';
        const yandexResponse = await lookupViaYandex(normalized, lang, apiLang);
        if (yandexResponse) {
          const yandexResults = buildYandexEntries(normalized, lang, yandexResponse);
          if (yandexResults.length) {
            const cefrLevel = lang === 'en' ? await getCefrLevelForQuery(normalized) : null;
            const audioUrl = lang === 'en' ? await getPronunciationAudioUrlForQuery(normalized) : null;
            if (lang === 'en') {
              const synonymsResponse = await lookupViaYandex(normalized, 'en-en', 'en-en');
              const synonyms = synonymsResponse
                ? extractYandexTranslations(synonymsResponse).filter(value => value !== normalized)
                : [];
              if (synonyms.length) {
                yandexResults[0].synonyms = synonyms;
              }
            } else {
              const englishSynonyms = extractYandexTranslations(yandexResponse).filter(
                value => value !== yandexResults[0].word,
              );
              if (englishSynonyms.length) {
                yandexResults[0].synonyms = englishSynonyms;
              }
              const ruResponse = await lookupViaYandex(normalized, 'ru-ru', 'ru-ru');
              const ruTranslations = ruResponse
                ? extractYandexTranslations(ruResponse).filter(value => value !== normalized)
                : [];
              if (ruTranslations.length) {
                yandexResults[0].translations = ruTranslations;
              }
            }
            if (cefrLevel) {
              yandexResults.forEach((item) => {
                item.cefrLevel = cefrLevel;
              });
            }
            if (audioUrl) {
              yandexResults.forEach((item) => {
                item.audioUrl = audioUrl;
              });
            }
            return yandexResults;
          }
        }
      } catch (error) {
        console.error('Yandex dictionary lookup error:', error);
      }
    }

    if (lang === 'ru') {
      return this.lookupByTranslation(normalized);
    }

    // Точное совпадение (самый приоритетный)
    const exactMatch = await prisma.$queryRaw<Array<{
      id: number;
      word: string;
      part_of_speech: string | null;
      translations: string;
    }>>(Prisma.sql`
      SELECT id, word, part_of_speech, translations
      FROM mueller_dictionary
      WHERE LOWER(word) = ${normalized}
      LIMIT 10
    `);

    if (exactMatch.length > 0) {
      const cefrLevel = await getCefrLevelForQuery(normalized);
      const audioUrl = await getPronunciationAudioUrlForQuery(normalized);
      return exactMatch.map(row => ({
        id: row.id,
        word: row.word,
        partOfSpeech: row.part_of_speech,
        translations: row.translations.split('||').filter(Boolean),
        cefrLevel,
        audioUrl,
      }));
    }

    // Поиск по началу слова
    const prefixMatch = await prisma.$queryRaw<Array<{
      id: number;
      word: string;
      part_of_speech: string | null;
      translations: string;
    }>>(Prisma.sql`
      SELECT id, word, part_of_speech, translations
      FROM mueller_dictionary
      WHERE LOWER(word) LIKE CONCAT(${normalized}, '%')
      LIMIT 10
    `);

    if (prefixMatch.length > 0) {
      const cefrLevel = await getCefrLevelForQuery(normalized);
      const audioUrl = await getPronunciationAudioUrlForQuery(normalized);
      return prefixMatch.map(row => ({
        id: row.id,
        word: row.word,
        partOfSpeech: row.part_of_speech,
        translations: row.translations.split('||').filter(Boolean),
        cefrLevel,
        audioUrl,
      }));
    }

    // Полнотекстовый поиск если ничего не найдено
    const fulltextMatch = await prisma.$queryRaw<Array<{
      id: number;
      word: string;
      part_of_speech: string | null;
      translations: string;
    }>>(Prisma.sql`
      SELECT id, word, part_of_speech, translations
      FROM mueller_dictionary
      WHERE MATCH(word) AGAINST(${word} IN BOOLEAN MODE)
      LIMIT 10
    `);

    const cefrLevel = await getCefrLevelForQuery(normalized);
    const audioUrl = await getPronunciationAudioUrlForQuery(normalized);
    return fulltextMatch.map(row => ({
      id: row.id,
      word: row.word,
      partOfSpeech: row.part_of_speech,
      translations: row.translations.split('||').filter(Boolean),
      cefrLevel,
      audioUrl,
    }));
  },

  async lookupByTranslation(word: string): Promise<MuellerLookupResult[]> {
    const normalized = word.trim().toLowerCase();
    if (!normalized) return [];

    const match = await prisma.$queryRaw<Array<{
      id: number;
      word: string;
      part_of_speech: string | null;
      translations: string;
    }>>(Prisma.sql`
      SELECT id, word, part_of_speech, translations
      FROM mueller_dictionary
      WHERE CONCAT('||', LOWER(translations), '||') LIKE CONCAT('%||', ${normalized}, '||%')
      ORDER BY
        CASE
          WHEN LOWER(translations) = ${normalized}
            OR LOWER(translations) LIKE CONCAT(${normalized}, '||%')
          THEN 0
          ELSE 1
        END,
        NULLIF(
          LOCATE(CONCAT('||', ${normalized}, '||'), CONCAT('||', LOWER(translations), '||')),
          0
        )
      LIMIT 10
    `);

    return match.map(row => ({
      id: row.id,
      word: row.word,
      partOfSpeech: row.part_of_speech,
      translations: row.translations.split('||').filter(Boolean),
    }));
  },

  /**
   * Получает слово по ID
   */
  async getById(id: number): Promise<MuellerLookupResult | null> {
    const row = await prisma.$queryRaw<Array<{
      id: number;
      word: string;
      part_of_speech: string | null;
      translations: string;
    }>>(Prisma.sql`
      SELECT id, word, part_of_speech, translations
      FROM mueller_dictionary
      WHERE id = ${id}
      LIMIT 1
    `);

    if (row.length === 0) {
      return null;
    }

    return {
      id: row[0].id,
      word: row[0].word,
      partOfSpeech: row[0].part_of_speech,
      translations: row[0].translations.split('||').filter(Boolean),
    };
  },

  /**
   * Получает несколько слов по их ID
   */
  async getByIds(ids: number[]): Promise<MuellerLookupResult[]> {
    if (ids.length === 0) {
      return [];
    }

    const uniqueIds = Array.from(new Set(ids));

    const rows = await prisma.$queryRaw<Array<{
      id: number;
      word: string;
      part_of_speech: string | null;
      translations: string;
    }>>(Prisma.sql`
      SELECT id, word, part_of_speech, translations
      FROM mueller_dictionary
      WHERE id IN (${Prisma.join(uniqueIds)})
    `);

    return rows.map(row => ({
      id: row.id,
      word: row.word,
      partOfSpeech: row.part_of_speech,
      translations: row.translations.split('||').filter(Boolean),
    }));
  },
};
