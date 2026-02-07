import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/prisma/prismaClient';
import { buildYandexEntries, muellerService, type YandexDictResponse } from '../mueller/mueller.service';

type DbWordRow = {
  wordId: number;
  word: string;
  partOfSpeech: string | null;
  translations: string[];
};

type DbProgressRow = {
  word_id: number;
  status: string | null;
  touches_total: number | null;
  touches_correct: number | null;
  streak: number | null;
  added_to_vocab: number | null;
};

type Progress = {
  status: string;
  touchesTotal: number;
  touchesCorrect: number;
  streak: number;
  addedToVocab: boolean;
};

type ExerciseDirection = 'en-ru' | 'ru-en';

type Exercise = {
  wordId: number;
  word: string;
  partOfSpeech: string | null;
  direction: ExerciseDirection;
  prompt: string;
  correctAnswer: string;
  options: string[];
  translations: string[];
  progress: Progress;
};

const MAX_WORD_LIMIT = 100;
const MAX_EXERCISE_LIMIT = 80;
const TOUCH_GOAL = 5;

const uniqStrings = (values: string[]): string[] => {
  const set = new Set<string>();
  values.forEach((value) => {
    if (value && typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) set.add(trimmed);
    }
  });
  return Array.from(set);
};

const shuffleArray = <T>(input: T[]): T[] => {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const buildOptions = (correct: string, pool: string[], extras: string[] = []): string[] => {
  const seen = new Set<string>();
  const options: string[] = [];
  const combined = shuffleArray([...extras, ...pool]);

  options.push(correct);
  seen.add(correct);

  for (const candidate of combined) {
    const normalized = candidate?.trim();
    if (!normalized || seen.has(normalized)) continue;
    options.push(normalized);
    seen.add(normalized);
    if (options.length >= 3) break;
  }

  while (options.length < 3) {
    options.push(correct);
  }

  return shuffleArray(options);
};

const fetchProgress = async (userId: string, wordId: number): Promise<Progress> => {
  const [row] = await prisma.$queryRaw<DbProgressRow[]>(Prisma.sql`
    SELECT word_id, status, touches_total, touches_correct, streak, added_to_vocab
    FROM user_word_progress
    WHERE user_id = ${userId} AND word_id = ${wordId}
    LIMIT 1
  `);

  return {
    status: row?.status ?? 'new',
    touchesTotal: Number(row?.touches_total ?? 0),
    touchesCorrect: Number(row?.touches_correct ?? 0),
    streak: Number(row?.streak ?? 0),
    addedToVocab: Boolean(row?.added_to_vocab),
  };
};

export const exercisesService = {
  async getWordIndex() {
    const rows = await prisma.yandexDictionaryCache.findMany({
      where: { lang: "en" },
      select: { id: true, query: true },
    });
    return rows;
  },
  async getExercisesForUser(
    userId: string,
    wordIds: number[],
    wordLimit?: number,
    exerciseLimit?: number,
  ): Promise<Exercise[]> {

    const uniqueIds = Array.from(new Set(wordIds.map((id) => Number(id)).filter(Number.isInteger)));

    const effectiveWordLimit = Math.min(
      MAX_WORD_LIMIT,
      wordLimit && wordLimit > 0 ? wordLimit : uniqueIds.length,
    );
    const limitedWordIds = uniqueIds.slice(0, effectiveWordLimit);

    if (!limitedWordIds.length) {
      return [];
    }

    const progressRows = await prisma.$queryRaw<DbProgressRow[]>(Prisma.sql`
      SELECT word_id, status, touches_total, touches_correct, streak, added_to_vocab
      FROM user_word_progress
      WHERE user_id = ${userId} AND word_id IN (${Prisma.join(limitedWordIds)})
    `);

    const excludedIds = new Set(
      progressRows
        .filter((row) => row.status === 'known' || row.status === 'ignored')
        .map((row) => Number(row.word_id)),
    );

    const candidateIds = limitedWordIds.filter((id) => !excludedIds.has(id));

    if (!candidateIds.length) {
      return [];
    }

    const cacheRows = await prisma.yandexDictionaryCache.findMany({
      where: { id: { in: candidateIds }, lang: 'en' },
      select: { id: true, query: true, lang: true, response: true },
    });

    const wordRows: DbWordRow[] = cacheRows
      .map((row) => {
        const entries = buildYandexEntries(
          row.query,
          row.lang === 'ru' ? 'ru' : 'en',
          row.response as YandexDictResponse,
        );
        const primary = entries[0];
        if (!primary || !primary.translations.length) return null;
        return {
          wordId: row.id,
          word: primary.word ?? row.query,
          partOfSpeech: primary.partOfSpeech ?? null,
          translations: primary.translations,
        } as DbWordRow;
      })
      .filter((value): value is DbWordRow => Boolean(value));

    if (!wordRows.length) {
      return [];
    }

    const candidateWordsLower = uniqStrings(wordRows.map((row) => row.word.toLowerCase()));
    const vocabRows = candidateWordsLower.length
      ? await prisma.$queryRaw<{ word: string }[]>(Prisma.sql`
          SELECT word
          FROM user_words
          WHERE userId = ${userId}
            AND LOWER(word) IN (${Prisma.join(candidateWordsLower)})
        `)
      : [];
    const vocabSet = new Set(vocabRows.map((row) => row.word.toLowerCase()));

    const progressByWord = new Map<number, Progress>();
    progressRows.forEach((row) => {
      const progress: Progress = {
        status: row.status ?? 'new',
        touchesTotal: Number(row.touches_total ?? 0),
        touchesCorrect: Number(row.touches_correct ?? 0),
        streak: Number(row.streak ?? 0),
        addedToVocab: Boolean(row.added_to_vocab),
      };
      progressByWord.set(Number(row.word_id), progress);
    });

    const translationPool = uniqStrings(wordRows.flatMap((row) => row.translations));

    const maxExercises = Math.min(
      MAX_EXERCISE_LIMIT,
      exerciseLimit && exerciseLimit > 0 ? exerciseLimit : candidateIds.length,
    );

    const exerciseKeys = new Set<string>();
    const exercises: Exercise[] = [];

    for (const row of wordRows) {
      if (exercises.length >= maxExercises) break;

      const translations = row.translations;
      if (!translations.length) continue;

      const correctRu = translations[0];
      const progressBase = progressByWord.get(row.wordId);
      const progress: Progress = progressBase
        ? {
            ...progressBase,
            addedToVocab:
              progressBase.addedToVocab || vocabSet.has(row.word.toLowerCase()),
          }
        : {
            status: 'new',
            touchesTotal: 0,
            touchesCorrect: 0,
            streak: 0,
            addedToVocab: vocabSet.has(row.word.toLowerCase()),
          };

      const enRuKey = `${row.wordId}-en-ru`;
      if (!exerciseKeys.has(enRuKey)) {
        exerciseKeys.add(enRuKey);

        const enRuOptions = buildOptions(
          correctRu,
          translationPool.filter((item) => item !== correctRu),
          translations.slice(1),
        );

        exercises.push({
          wordId: row.wordId,
          word: row.word,
          partOfSpeech: row.partOfSpeech,
          direction: 'en-ru',
          prompt: row.word,
          correctAnswer: correctRu,
          options: enRuOptions,
          translations: [correctRu],
          progress: {
            ...progress,
            addedToVocab: progress.addedToVocab || vocabSet.has(row.word.toLowerCase()),
          },
        });
      }
    }

    const finalExercises = shuffleArray(exercises.slice(0, maxExercises));
    return finalExercises;
  },

  async submitAnswer(userId: string, wordId: number, isCorrect: boolean): Promise<Progress> {
    const isCorrectInt = isCorrect ? 1 : 0;

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO user_word_progress (user_id, word_id, status, touches_total, touches_correct, streak, added_to_vocab)
      VALUES (
        ${userId},
        ${wordId},
        CASE WHEN ${isCorrectInt} >= ${TOUCH_GOAL} THEN 'known' ELSE 'learning' END,
        1,
        ${isCorrectInt},
        CASE WHEN ${isCorrectInt} > 0 THEN 1 ELSE 0 END,
        0
      )
      ON DUPLICATE KEY UPDATE
        touches_total = touches_total + 1,
        touches_correct = touches_correct + ${isCorrectInt},
        streak = CASE WHEN ${isCorrectInt} > 0 THEN streak + 1 ELSE 0 END,
        status = CASE
          WHEN status IN ('known', 'ignored') THEN status
          WHEN touches_correct + ${isCorrectInt} >= ${TOUCH_GOAL} THEN 'known'
          ELSE 'learning'
        END;
    `);

    // Fetch updated progress - needed to return accurate values after update
    return fetchProgress(userId, wordId);
  },

  async markKnown(userId: string, wordId: number): Promise<Progress> {
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO user_word_progress (user_id, word_id, status, touches_total, touches_correct, streak, added_to_vocab)
      VALUES (${userId}, ${wordId}, 'known', 1, 1, 1, 0)
      ON DUPLICATE KEY UPDATE
        status = 'known',
        touches_total = CASE WHEN touches_total < 1 THEN 1 ELSE touches_total END,
        touches_correct = CASE WHEN touches_correct < 1 THEN 1 ELSE touches_correct END,
        streak = CASE WHEN streak < 1 THEN 1 ELSE streak END;
    `);

    return fetchProgress(userId, wordId);
  },

  async addToVocab(userId: string, wordId: number, note?: string): Promise<Progress> {
    const entry = await muellerService.getById(wordId);
    if (!entry) {
      throw Object.assign(new Error('Word not found'), { status: 404 });
    }

    const primaryTranslation = entry.translations[0] ?? '';
    const existing = await prisma.userWord.findFirst({
      where: {
        userId,
        word: entry.word,
        translation: primaryTranslation,
      },
    });
    if (!existing) {
      await prisma.userWord.create({
        data: {
          userId,
          word: entry.word,
          translation: primaryTranslation,
          partOfSpeech: entry.partOfSpeech,
          sourceLang: 'en',
          targetLang: 'ru',
        },
      });
    }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO user_word_progress (user_id, word_id, status, touches_total, touches_correct, streak, added_to_vocab)
      VALUES (${userId}, ${wordId}, 'learning', 0, 0, 0, 1)
      ON DUPLICATE KEY UPDATE added_to_vocab = 1;
    `);

    return fetchProgress(userId, wordId);
  },
};


