import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/prisma/prismaClient';

export interface MuellerLookupResult {
  id: number;
  word: string;
  partOfSpeech: string | null;
  translations: string[];
}

type LookupLang = 'en' | 'ru';

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
      return exactMatch.map(row => ({
        id: row.id,
        word: row.word,
        partOfSpeech: row.part_of_speech,
        translations: row.translations.split('||').filter(Boolean),
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
      return prefixMatch.map(row => ({
        id: row.id,
        word: row.word,
        partOfSpeech: row.part_of_speech,
        translations: row.translations.split('||').filter(Boolean),
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

    return fulltextMatch.map(row => ({
      id: row.id,
      word: row.word,
      partOfSpeech: row.part_of_speech,
      translations: row.translations.split('||').filter(Boolean),
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
      WHERE LOWER(translations) LIKE CONCAT('%', ${normalized}, '%')
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
