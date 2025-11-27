import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/prisma/prismaClient';

type MuellerWord = {
  id: number;
  word: string;
  part_of_speech: string | null;
  translations: string;
  moderated: number;
};

type PrecomputedExercise = {
  id: number;
  word_id: number;
  word: string;
  part_of_speech: string | null;
  translations: string;
  direction: string;
  prompt: string;
  correct_answer: string;
  options: string;
  moderated: number;
};

export const adminService = {
  async getWords(
    page: number,
    limit: number,
    moderatedFilter?: string,
  ): Promise<{ words: MuellerWord[]; total: number; page: number; totalPages: number }> {
    const offset = (page - 1) * limit;

    const countQuery =
      moderatedFilter === 'true'
        ? Prisma.sql`SELECT COUNT(*) as total FROM mueller_dictionary WHERE moderated = 1`
        : moderatedFilter === 'false'
          ? Prisma.sql`SELECT COUNT(*) as total FROM mueller_dictionary WHERE moderated = 0`
          : Prisma.sql`SELECT COUNT(*) as total FROM mueller_dictionary`;

    const [countResult] = await prisma.$queryRaw<{ total: bigint }[]>(countQuery);
    const total = Number(countResult.total);

    const wordsQuery =
      moderatedFilter === 'true'
        ? Prisma.sql`
      SELECT id, word, part_of_speech, translations, moderated
      FROM mueller_dictionary
      WHERE moderated = 1
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `
        : moderatedFilter === 'false'
          ? Prisma.sql`
      SELECT id, word, part_of_speech, translations, moderated
      FROM mueller_dictionary
      WHERE moderated = 0
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `
          : Prisma.sql`
      SELECT id, word, part_of_speech, translations, moderated
      FROM mueller_dictionary
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `;

    const words = await prisma.$queryRaw<MuellerWord[]>(wordsQuery);

    return {
      words,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  async updateWord(
    id: number,
    word: string,
    partOfSpeech: string | null,
    translations: string[],
  ): Promise<void> {
    const translationsStr = translations.join('||');

    await prisma.$executeRaw(Prisma.sql`
      UPDATE mueller_dictionary
      SET word = ${word},
          part_of_speech = ${partOfSpeech},
          translations = ${translationsStr}
      WHERE id = ${id}
    `);
  },

  async deleteWord(id: number): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM mueller_dictionary WHERE id = ${id}
    `);
  },

  async moderateWord(id: number, moderated: boolean): Promise<void> {
    const moderatedInt = moderated ? 1 : 0;

    await prisma.$executeRaw(Prisma.sql`
      UPDATE mueller_dictionary
      SET moderated = ${moderatedInt}
      WHERE id = ${id}
    `);
  },

  // Precomputed exercises
  async getPrecomputedExercises(
    page: number,
    limit: number,
    moderatedFilter?: string,
  ): Promise<{ items: PrecomputedExercise[]; total: number; page: number; totalPages: number }> {
    const offset = (page - 1) * limit;

    const countQuery =
      moderatedFilter === 'true'
        ? Prisma.sql`SELECT COUNT(*) as total FROM precomputed_exercises WHERE moderated = 1`
        : moderatedFilter === 'false'
          ? Prisma.sql`SELECT COUNT(*) as total FROM precomputed_exercises WHERE moderated = 0`
          : Prisma.sql`SELECT COUNT(*) as total FROM precomputed_exercises`;

    const [countResult] = await prisma.$queryRaw<{ total: bigint }[]>(countQuery);
    const total = Number(countResult.total);

    const itemsQuery =
      moderatedFilter === 'true'
        ? Prisma.sql`
      SELECT id, word_id, word, part_of_speech, translations, direction, prompt, correct_answer, options, moderated
      FROM precomputed_exercises
      WHERE moderated = 1
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `
        : moderatedFilter === 'false'
          ? Prisma.sql`
      SELECT id, word_id, word, part_of_speech, translations, direction, prompt, correct_answer, options, moderated
      FROM precomputed_exercises
      WHERE moderated = 0
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `
          : Prisma.sql`
      SELECT id, word_id, word, part_of_speech, translations, direction, prompt, correct_answer, options, moderated
      FROM precomputed_exercises
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `;

    const items = await prisma.$queryRaw<PrecomputedExercise[]>(itemsQuery);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  async updatePrecomputedExercise(
    id: number,
    prompt: string,
    correctAnswer: string,
    options: string[],
    translations: string[],
    partOfSpeech: string | null,
  ): Promise<void> {
    const optionsStr = JSON.stringify(options);
    const translationsStr = translations.join('||');

    await prisma.$executeRaw(Prisma.sql`
      UPDATE precomputed_exercises
      SET prompt = ${prompt},
          correct_answer = ${correctAnswer},
          options = ${optionsStr},
          translations = ${translationsStr},
          part_of_speech = ${partOfSpeech}
      WHERE id = ${id}
    `);
  },

  async deletePrecomputedExercise(id: number): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM precomputed_exercises WHERE id = ${id}
    `);
  },

  async moderatePrecomputedExercise(id: number, moderated: boolean): Promise<void> {
    const moderatedInt = moderated ? 1 : 0;

    await prisma.$executeRaw(Prisma.sql`
      UPDATE precomputed_exercises
      SET moderated = ${moderatedInt}
      WHERE id = ${id}
    `);
  },
};
