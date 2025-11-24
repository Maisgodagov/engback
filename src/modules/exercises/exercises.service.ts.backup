import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/prisma/prismaClient';

type DbWordRow = {
  wordId: number;
  word: string;
  partOfSpeech: string | null;
  translations: string | null;
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

const parseTranslations = (value: string | null): string[] => {
  if (!value) return [];
  return value
    .split('||')
    .map((item) => item.trim())
    .filter(Boolean);
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
  async getExercisesForUser(
    userId: string,
    wordIds: number[],
    wordLimit?: number,
    exerciseLimit?: number,
  ): Promise<Exercise[]> {
    console.log(`[EXERCISES] 📥 Received request for userId: ${userId}`);
    console.log(`[EXERCISES] 📥 Total wordIds: ${wordIds.length}`);
    console.log(`[EXERCISES] 📥 First 20 wordIds:`, wordIds.slice(0, 20));

    const uniqueIds = Array.from(new Set(wordIds.map((id) => Number(id)).filter(Number.isInteger)));
    console.log(`[EXERCISES] 🔢 Unique wordIds: ${uniqueIds.length}`);

    const effectiveWordLimit = Math.min(
      MAX_WORD_LIMIT,
      wordLimit && wordLimit > 0 ? wordLimit : uniqueIds.length,
    );
    const limitedWordIds = uniqueIds.slice(0, effectiveWordLimit);
    console.log(`[EXERCISES] 🎯 Limited to ${limitedWordIds.length} words (limit: ${effectiveWordLimit})`);

    if (!limitedWordIds.length) {
      console.log(`[EXERCISES] ⚠️  No valid wordIds, returning empty array`);
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
    console.log(`[EXERCISES] 🔍 After filtering known/ignored: ${candidateIds.length} candidates`);
    console.log(`[EXERCISES] 🔍 Candidate IDs (first 20):`, candidateIds.slice(0, 20));

    if (!candidateIds.length) {
      console.log(`[EXERCISES] ⚠️  No candidate words after filtering, returning empty`);
      return [];
    }

    const wordRows = await prisma.$queryRaw<DbWordRow[]>(Prisma.sql`
      SELECT
        m.id AS wordId,
        m.word,
        m.part_of_speech AS partOfSpeech,
        m.translations
      FROM mueller_dictionary m
      WHERE m.id IN (${Prisma.join(candidateIds)})
    `);

    console.log(`[EXERCISES] 📖 Found ${wordRows.length} words in mueller_dictionary`);
    if (wordRows.length > 0) {
      console.log(`[EXERCISES] 📖 First 5 words:`, wordRows.slice(0, 5).map(w => ({ id: w.wordId, word: w.word })));
    }

    if (!wordRows.length) {
      console.log(`[EXERCISES] ⚠️  No words found in mueller_dictionary for given IDs!`);
      return [];
    }

    const vocabRows = await prisma.$queryRaw<{ word_id: number }[]>(Prisma.sql`
      SELECT word_id FROM user_vocab
      WHERE user_id = ${userId} AND word_id IN (${Prisma.join(candidateIds)})
    `);
    const vocabSet = new Set(vocabRows.map((row) => Number(row.word_id)));

    const progressByWord = new Map<number, Progress>();
    progressRows.forEach((row) => {
      const progress: Progress = {
        status: row.status ?? 'new',
        touchesTotal: Number(row.touches_total ?? 0),
        touchesCorrect: Number(row.touches_correct ?? 0),
        streak: Number(row.streak ?? 0),
        addedToVocab: Boolean(row.added_to_vocab) || vocabSet.has(Number(row.word_id)),
      };
      progressByWord.set(Number(row.word_id), progress);
    });

    // Use offset-based randomization instead of ORDER BY RAND() for better performance
    const randomOffset1 = Math.floor(Math.random() * 1000);
    const randomOffset2 = Math.floor(Math.random() * 1000);

    const translationPoolRows = await prisma.$queryRaw<{ translations: string }[]>(Prisma.sql`
      SELECT translations
      FROM mueller_dictionary
      WHERE id NOT IN (${Prisma.join(candidateIds)})
      LIMIT 200 OFFSET ${randomOffset1}
    `);

    const wordPoolRows = await prisma.$queryRaw<{ word: string }[]>(Prisma.sql`
      SELECT word
      FROM mueller_dictionary
      WHERE id NOT IN (${Prisma.join(candidateIds)})
      LIMIT 200 OFFSET ${randomOffset2}
    `);

    const translationPool = uniqStrings([
      ...translationPoolRows.flatMap((row) => parseTranslations(row.translations)),
      ...wordRows.flatMap((row) => parseTranslations(row.translations)),
    ]);

    const wordPool = uniqStrings([
      ...wordPoolRows.map((row) => row.word),
      ...wordRows.map((row) => row.word),
    ]);

    const maxExercises = Math.min(
      MAX_EXERCISE_LIMIT,
      exerciseLimit && exerciseLimit > 0 ? exerciseLimit : candidateIds.length * 2,
    );

    const exerciseKeys = new Set<string>();
    const exercises: Exercise[] = [];

    for (const row of wordRows) {
      if (exercises.length >= maxExercises) break;

      const translations = parseTranslations(row.translations);
      if (!translations.length) continue;

      const correctRu = translations[0];
      const progress = progressByWord.get(row.wordId) ?? {
        status: 'new',
        touchesTotal: 0,
        touchesCorrect: 0,
        streak: 0,
        addedToVocab: vocabSet.has(row.wordId),
      };

      // Randomize direction generation:
      // 75% chance: only one direction (randomly chosen)
      // 25% chance: both directions
      const random = Math.random();
      const generateBoth = random < 0.25; // 25% chance for both
      const generateEnRu = generateBoth || random >= 0.625; // 25% both + 37.5% only en-ru = 62.5%
      const generateRuEn = generateBoth || (random >= 0.25 && random < 0.625); // 25% both + 37.5% only ru-en = 62.5%

      if (generateEnRu) {
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
            progress: { ...progress, addedToVocab: progress.addedToVocab || vocabSet.has(row.wordId) },
          });
        }
      }

      if (exercises.length >= maxExercises) break;

      if (generateRuEn) {
        const ruEnKey = `${row.wordId}-ru-en`;
        if (!exerciseKeys.has(ruEnKey)) {
          exerciseKeys.add(ruEnKey);

          const ruEnOptions = buildOptions(
            row.word,
            wordPool.filter((item) => item !== row.word),
          );

          exercises.push({
            wordId: row.wordId,
            word: row.word,
            partOfSpeech: row.partOfSpeech,
            direction: 'ru-en',
            prompt: correctRu,
            correctAnswer: row.word,
            options: ruEnOptions,
            translations: [correctRu],
            progress: { ...progress, addedToVocab: progress.addedToVocab || vocabSet.has(row.wordId) },
          });
        }
      }
    }

    const finalExercises = shuffleArray(exercises.slice(0, maxExercises));
    console.log(`[EXERCISES] ✅ Returning ${finalExercises.length} exercises`);
    if (finalExercises.length > 0) {
      console.log(`[EXERCISES] ✅ First 3 exercises:`, finalExercises.slice(0, 3).map(e => ({
        wordId: e.wordId,
        word: e.word,
        direction: e.direction,
        prompt: e.prompt.substring(0, 30)
      })));
    }
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
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO user_vocab (user_id, word_id, note)
      VALUES (${userId}, ${wordId}, ${note ?? null})
      ON DUPLICATE KEY UPDATE note = VALUES(note);
    `);

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO user_word_progress (user_id, word_id, status, touches_total, touches_correct, streak, added_to_vocab)
      VALUES (${userId}, ${wordId}, 'learning', 0, 0, 0, 1)
      ON DUPLICATE KEY UPDATE added_to_vocab = 1;
    `);

    return fetchProgress(userId, wordId);
  },
};
