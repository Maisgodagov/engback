import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/prisma/prismaClient';

type DbWordRow = {
  wordId: number;
  lemma: string;
  pos: string | null;
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
  lemma: string;
  pos: string | null;
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
    const uniqueIds = Array.from(new Set(wordIds.map((id) => Number(id)).filter(Number.isInteger)));
    const effectiveWordLimit = Math.min(
      MAX_WORD_LIMIT,
      wordLimit && wordLimit > 0 ? wordLimit : uniqueIds.length,
    );
    const limitedWordIds = uniqueIds.slice(0, effectiveWordLimit);
    console.log('[Exercises Service] Input wordIds:', uniqueIds.length);
    console.log('[Exercises Service] Limited to:', limitedWordIds.length);

    if (!limitedWordIds.length) return [];

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
    console.log('[Exercises Service] Excluded (known/ignored):', excludedIds.size);
    console.log('[Exercises Service] Candidate words:', candidateIds.length);
    if (!candidateIds.length) return [];

    const wordRows = await prisma.$queryRaw<DbWordRow[]>(Prisma.sql`
      SELECT
        w.id AS wordId,
        w.lemma,
        w.pos,
        GROUP_CONCAT(t.translation ORDER BY t.priority SEPARATOR '||') AS translations
      FROM dict_words w
      LEFT JOIN dict_translations t ON t.word_id = w.id
      WHERE w.id IN (${Prisma.join(candidateIds)})
      GROUP BY w.id, w.lemma, w.pos
    `);

    if (!wordRows.length) return [];
    console.log('[Exercises Service] Words with translations:', wordRows.length);

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

    const translationPoolRows = await prisma.$queryRaw<{ translation: string }[]>(Prisma.sql`
      SELECT translation
      FROM dict_translations
      WHERE word_id NOT IN (${Prisma.join(candidateIds)})
      ORDER BY RAND()
      LIMIT 200
    `);

    const lemmaPoolRows = await prisma.$queryRaw<{ lemma: string }[]>(Prisma.sql`
      SELECT lemma
      FROM dict_words
      WHERE id NOT IN (${Prisma.join(candidateIds)})
      ORDER BY RAND()
      LIMIT 200
    `);

    const translationPool = uniqStrings([
      ...translationPoolRows.map((row) => row.translation),
      ...wordRows.flatMap((row) => parseTranslations(row.translations)),
    ]);

    const lemmaPool = uniqStrings([
      ...lemmaPoolRows.map((row) => row.lemma),
      ...wordRows.map((row) => row.lemma),
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
      if (!translations.length) {
        console.warn(`[Exercises Service] Word ${row.wordId} (${row.lemma}) has no translations`);
        continue;
      }

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
            lemma: row.lemma,
            pos: row.pos,
            direction: 'en-ru',
            prompt: row.lemma,
            correctAnswer: correctRu,
            options: enRuOptions,
            translations,
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
            row.lemma,
            lemmaPool.filter((item) => item !== row.lemma),
          );

          exercises.push({
            wordId: row.wordId,
            lemma: row.lemma,
            pos: row.pos,
            direction: 'ru-en',
            prompt: correctRu,
            correctAnswer: row.lemma,
            options: ruEnOptions,
            translations,
            progress: { ...progress, addedToVocab: progress.addedToVocab || vocabSet.has(row.wordId) },
          });
        }
      }
    }

    console.log('[Exercises Service] Generated exercises:', exercises.length);
    return shuffleArray(exercises.slice(0, maxExercises));
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
