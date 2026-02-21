import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { prisma } from '../../shared/prisma/prismaClient';
import { buildYandexEntries, type YandexDictResponse } from '../mueller/mueller.service';
import { videoLearningService } from '../video-learning/videoLearning.service';

type SourceType = 'manual' | 'viewed' | 'exercise';
type QueueReason = 'review' | 'mistake' | 'new' | 'retry';
type SessionStatus = 'active' | 'completed' | 'interrupted';
type ProgressStatus = 'new' | 'learning' | 'review' | 'mastered';
type RecognitionGrade = 'again' | 'hard' | 'good' | 'easy';
type ExerciseType = 'missing' | 'audio_assemble' | 'match_pairs';

type SourceCandidate = {
  wordKey: string;
  word: string;
  translation: string;
  sourceType: SourceType;
  sourceWeight: number;
  sourceUpdatedAt: Date;
  yandexCacheId: number | null;
  mistakeScore: number;
};

type ProgressRow = {
  id: number;
  user_id: string;
  word_key: string;
  word: string;
  translation: string;
  source_type: SourceType;
  source_weight: number;
  source_updated_at: Date;
  yandex_cache_id: number | null;
  status: ProgressStatus;
  srs_stage: number;
  ease_factor: number;
  interval_days: number;
  due_at: Date | null;
  last_reviewed_at: Date | null;
  next_due_at: Date | null;
  review_count: number;
  correct_count: number;
  wrong_count: number;
  forgotten_count: number;
  hard_count: number;
  good_count: number;
  easy_count: number;
  last_grade: RecognitionGrade | null;
  created_at: Date;
  updated_at: Date;
  cefr_level?: string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  status: SessionStatus;
  target_words: number;
  phrase_exercises_per_word: number;
  energy_start: number;
  energy_left: number;
  review_planned: number;
  mistake_planned: number;
  new_planned: number;
  words_completed: number;
  xp_earned: number;
  xp_applied: number;
  started_at: Date;
  completed_at: Date | null;
};

type SessionItemRow = {
  id: number;
  session_id: string;
  queue_order: number;
  word_key: string;
  word: string;
  translation: string;
  source_type: SourceType;
  yandex_cache_id: number | null;
  reason: QueueReason;
  priority_score: number;
  initial_status: ProgressStatus;
  initial_stage: number;
  phase: 'recognition' | 'reinforcement' | 'done';
  state: 'pending' | 'completed' | 'skipped';
  recognition_grade: RecognitionGrade | null;
  recognition_at: Date | null;
  reinforcement_type: ExerciseType | null;
  reinforcement_correct: number | null;
  reinforcement_at: Date | null;
  attempt_count: number;
  context_content_id: number | null;
  context_start_seconds: number | null;
  context_end_seconds: number | null;
  context_text: string | null;
  reinforcement_sentence_en: string | null;
  reinforcement_sentence_ru: string | null;
  reinforcement_phrase_audio_url: string | null;
};

type QueueDraftItem = {
  wordKey: string;
  word: string;
  translation: string;
  sourceType: SourceType;
  yandexCacheId: number | null;
  reason: QueueReason;
  priorityScore: number;
  initialStatus: ProgressStatus;
  initialStage: number;
};

type WordExample = {
  contentId: number;
  videoName: string;
  videoUrl: string | null;
  startSeconds: number | null;
  endSeconds: number | null;
  text: string;
};

type GeneratedPhrase = {
  phraseEn: string;
  phraseRu: string | null;
  phraseAudioUrl: string | null;
};

type MissingExercisePayload = {
  type: 'missing';
  sentence: string;
  sentenceWithBlank: string;
  sentenceTranslation?: string | null;
  options: string[];
  correctWord: string;
  targetWord: string;
  phraseAudioUrl?: string | null;
};

type AudioAssembleExercisePayload = {
  type: 'audio_assemble';
  sentence: string;
  sentenceTranslation?: string | null;
  phraseAudioUrl?: string | null;
  assembleTokens: string[];
  targetTokens: string[];
  targetWord: string;
};

type MatchPairsExercisePayload = {
  type: 'match_pairs';
  targetWord: string;
  pairs: Array<{
    word: string;
    translation: string;
    pronunciationAudioUrl?: string | null;
  }>;
  shuffledTranslations: string[];
};

type SnippetModerationFilter = 'all' | 'moderated' | 'unmoderated';

type PreferredSnippetInput = {
  contentId: number;
  startSeconds: number;
  endSeconds: number;
  matchedText?: string | null;
  contextText?: string | null;
};

type StartSessionPreferences = {
  cefrLevel?: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  maxUniqueWords?: number;
  maxMatchPairsPerSession?: number;
  prioritizeUserInteractions?: boolean;
  levelMix?: {
    currentLevelWeight?: number;
    lowerLevelWeight?: number;
    higherLevelWeight?: number;
  };
  reinforcementMode?: {
    phraseExercisesPerWord?: number;
    retryMistakesAtEnd?: boolean;
  };
};

const SESSION_TARGET_DEFAULT = 5;
const SESSION_TARGET_MIN = 1;
const SESSION_TARGET_MAX = 5;
const PHRASE_EXERCISES_PER_WORD_DEFAULT = 3;
const PHRASE_EXERCISES_PER_WORD_MAX = 3;
const TOUCH_GOAL = 3;
const SESSION_ENERGY_START = 100;
const RECOGNITION_ENERGY_COST = 4;
const REINFORCEMENT_ENERGY_COST = 3;
const SOURCE_LIMIT = 500;
const MAX_RETRY_ATTEMPTS = 2;
const CEFR_LEVELS: Array<'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'> = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

let tablesReady = false;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const normalizeWord = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9'\s-]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ');
const normalizeCefrLevel = (value: string | null | undefined): string | null => {
  const normalized = String(value ?? '').trim().toUpperCase();
  return CEFR_LEVELS.includes(normalized as (typeof CEFR_LEVELS)[number]) ? normalized : null;
};

const normalizeOptionText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const shuffleArray = <T>(items: T[]): T[] => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const shuffleTranslationsWithDerangement = (
  sourcePairs: Array<{ word: string; translation: string }>,
): string[] => {
  const original = sourcePairs.map((pair) => pair.translation);
  if (original.length <= 1) return original;

  // Try random shuffles first, but avoid index-by-index match with original order.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const shuffled = shuffleArray(original);
    const unchanged = shuffled.every((value, index) => normalizeOptionText(value) === normalizeOptionText(original[index]));
    if (!unchanged) return shuffled;
  }

  // Deterministic fallback: rotate by one to guarantee at least one mismatch.
  return [...original.slice(1), original[0]];
};

const addMinutes = (base: Date, minutes: number): Date => new Date(base.getTime() + minutes * 60_000);
const addDays = (base: Date, days: number): Date => new Date(base.getTime() + days * 86_400_000);

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const calculateSrsAfterGrade = (
  row: ProgressRow,
  grade: RecognitionGrade,
  now: Date,
): {
  nextStatus: ProgressStatus;
  nextStage: number;
  nextEase: number;
  nextIntervalDays: number;
  nextDueAt: Date;
  reviewDelta: number;
  correctDelta: number;
  wrongDelta: number;
} => {
  const currentStage = Math.max(0, row.srs_stage);
  const currentEase = Math.max(1.3, row.ease_factor);
  const currentInterval = Math.max(0, row.interval_days);

  if (grade === 'again') {
    return {
      nextStatus: 'learning',
      nextStage: Math.max(0, currentStage - 1),
      nextEase: Math.max(1.3, currentEase - 0.2),
      nextIntervalDays: 0,
      nextDueAt: addMinutes(now, 20),
      reviewDelta: 1,
      correctDelta: 0,
      wrongDelta: 1,
    };
  }

  if (grade === 'hard') {
    const interval = currentInterval <= 0 ? 1 : Math.max(1, Math.ceil(currentInterval * 1.2));
    const stage = Math.min(12, Math.max(1, currentStage));
    return {
      nextStatus: stage >= 7 ? 'mastered' : stage >= 2 ? 'review' : 'learning',
      nextStage: stage,
      nextEase: Math.max(1.3, currentEase - 0.15),
      nextIntervalDays: interval,
      nextDueAt: addDays(now, interval),
      reviewDelta: 1,
      correctDelta: 1,
      wrongDelta: 0,
    };
  }

  if (grade === 'easy') {
    const stage = Math.min(12, currentStage + 2);
    const ease = Math.min(3.5, currentEase + 0.15);
    const interval =
      currentStage <= 0
        ? 4
        : Math.max(2, Math.ceil(Math.max(1, currentInterval) * ease * 1.3));
    return {
      nextStatus: stage >= 7 ? 'mastered' : stage >= 2 ? 'review' : 'learning',
      nextStage: stage,
      nextEase: ease,
      nextIntervalDays: interval,
      nextDueAt: addDays(now, interval),
      reviewDelta: 1,
      correctDelta: 1,
      wrongDelta: 0,
    };
  }

  const stage = Math.min(12, currentStage + 1);
  const interval =
    currentStage <= 0
      ? 1
      : currentStage === 1
      ? 3
      : Math.max(1, Math.ceil(Math.max(1, currentInterval) * currentEase));
  return {
    nextStatus: stage >= 7 ? 'mastered' : stage >= 2 ? 'review' : 'learning',
    nextStage: stage,
    nextEase: currentEase,
    nextIntervalDays: interval,
    nextDueAt: addDays(now, interval),
    reviewDelta: 1,
    correctDelta: 1,
    wrongDelta: 0,
  };
};

const xpForGrade = (grade: RecognitionGrade): number => {
  if (grade === 'again') return 1;
  if (grade === 'hard') return 2;
  if (grade === 'good') return 3;
  return 4;
};

const pickPhraseReinforcementType = (wordKey: string, seed = 0): ExerciseType => {
  let hash = 0;
  for (let i = 0; i < wordKey.length; i += 1) {
    hash = (hash * 31 + wordKey.charCodeAt(i)) | 0;
  }
  hash = (hash * 31 + seed) | 0;
  return Math.abs(hash) % 2 === 0 ? 'missing' : 'audio_assemble';
};

const ensureWordTrainingTables = async () => {
  if (tablesReady) return;

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS word_training_progress (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL,
      word_key VARCHAR(191) NOT NULL,
      word VARCHAR(255) NOT NULL,
      translation VARCHAR(255) NOT NULL,
      source_type VARCHAR(16) NOT NULL,
      source_weight INT NOT NULL DEFAULT 0,
      source_updated_at DATETIME(3) NOT NULL,
      yandex_cache_id INT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'new',
      srs_stage INT NOT NULL DEFAULT 0,
      ease_factor DECIMAL(4,2) NOT NULL DEFAULT 2.50,
      interval_days INT NOT NULL DEFAULT 0,
      due_at DATETIME(3) NULL,
      last_reviewed_at DATETIME(3) NULL,
      next_due_at DATETIME(3) NULL,
      review_count INT NOT NULL DEFAULT 0,
      correct_count INT NOT NULL DEFAULT 0,
      wrong_count INT NOT NULL DEFAULT 0,
      forgotten_count INT NOT NULL DEFAULT 0,
      hard_count INT NOT NULL DEFAULT 0,
      good_count INT NOT NULL DEFAULT 0,
      easy_count INT NOT NULL DEFAULT 0,
      last_grade VARCHAR(16) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_word_training_progress_user_word (user_id, word_key),
      KEY idx_word_training_progress_due (user_id, status, due_at),
      KEY idx_word_training_progress_source (user_id, source_type, source_updated_at),
      KEY idx_word_training_progress_yandex (yandex_cache_id)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS word_training_sessions (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(191) NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      target_words INT NOT NULL DEFAULT 20,
      phrase_exercises_per_word INT NOT NULL DEFAULT 2,
      energy_start INT NOT NULL DEFAULT 100,
      energy_left INT NOT NULL DEFAULT 100,
      review_planned INT NOT NULL DEFAULT 0,
      mistake_planned INT NOT NULL DEFAULT 0,
      new_planned INT NOT NULL DEFAULT 0,
      words_completed INT NOT NULL DEFAULT 0,
      xp_earned INT NOT NULL DEFAULT 0,
      xp_applied TINYINT(1) NOT NULL DEFAULT 0,
      started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      completed_at DATETIME(3) NULL,
      KEY idx_word_training_sessions_user_status (user_id, status, started_at),
      KEY idx_word_training_sessions_user_date (user_id, started_at)
    )
  `);

  const [phraseExercisesColumn] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'word_training_sessions'
      AND column_name = 'phrase_exercises_per_word'
  `);
  if (Number(phraseExercisesColumn?.total ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE word_training_sessions
      ADD COLUMN phrase_exercises_per_word INT NOT NULL DEFAULT 2
    `);
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS word_training_session_items (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      queue_order INT NOT NULL,
      word_key VARCHAR(191) NOT NULL,
      word VARCHAR(255) NOT NULL,
      translation VARCHAR(255) NOT NULL,
      source_type VARCHAR(16) NOT NULL,
      yandex_cache_id INT NULL,
      reason VARCHAR(16) NOT NULL,
      priority_score INT NOT NULL DEFAULT 0,
      initial_status VARCHAR(16) NOT NULL,
      initial_stage INT NOT NULL DEFAULT 0,
      phase VARCHAR(16) NOT NULL DEFAULT 'recognition',
      state VARCHAR(16) NOT NULL DEFAULT 'pending',
      recognition_grade VARCHAR(16) NULL,
      recognition_at DATETIME(3) NULL,
      reinforcement_type VARCHAR(16) NULL,
      reinforcement_correct TINYINT(1) NULL,
      reinforcement_at DATETIME(3) NULL,
      attempt_count INT NOT NULL DEFAULT 0,
      context_content_id INT NULL,
      context_start_seconds FLOAT NULL,
      context_end_seconds FLOAT NULL,
      context_text TEXT NULL,
      reinforcement_sentence_en VARCHAR(255) NULL,
      reinforcement_sentence_ru VARCHAR(255) NULL,
      reinforcement_phrase_audio_url VARCHAR(255) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_word_training_session_item_order (session_id, queue_order),
      KEY idx_word_training_session_items_state (session_id, state, queue_order),
      KEY idx_word_training_session_items_word (session_id, word_key)
    )
  `);

  const [sentenceEnCol] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'word_training_session_items'
      AND column_name = 'reinforcement_sentence_en'
  `);
  if (Number(sentenceEnCol?.total ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE word_training_session_items
      ADD COLUMN reinforcement_sentence_en VARCHAR(255) NULL
    `);
  }

  const [sentenceRuCol] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'word_training_session_items'
      AND column_name = 'reinforcement_sentence_ru'
  `);
  if (Number(sentenceRuCol?.total ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE word_training_session_items
      ADD COLUMN reinforcement_sentence_ru VARCHAR(255) NULL
    `);
  }

  const [sentenceAudioCol] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'word_training_session_items'
      AND column_name = 'reinforcement_phrase_audio_url'
  `);
  if (Number(sentenceAudioCol?.total ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE word_training_session_items
      ADD COLUMN reinforcement_phrase_audio_url VARCHAR(255) NULL
    `);
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS word_training_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(191) NOT NULL,
      word_key VARCHAR(191) NULL,
      event_type VARCHAR(32) NOT NULL,
      payload JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_word_training_events_session (session_id, created_at),
      KEY idx_word_training_events_user (user_id, created_at)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS word_training_preferred_snippets (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      yandex_cache_id INT NOT NULL,
      content_id INT NOT NULL,
      start_seconds FLOAT NOT NULL,
      end_seconds FLOAT NOT NULL,
      matched_text VARCHAR(255) NULL,
      context_text TEXT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_by_user_id VARCHAR(191) NULL,
      updated_by_user_id VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_word_pref_snippet (yandex_cache_id, content_id, start_seconds, end_seconds),
      KEY idx_word_pref_snippet_word (yandex_cache_id, is_enabled, updated_at),
      KEY idx_word_pref_snippet_content (content_id)
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS word_training_generated_phrases (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      yandex_cache_id INT NOT NULL,
      word VARCHAR(255) NOT NULL,
      phrase_en VARCHAR(255) NOT NULL,
      phrase_ru VARCHAR(255) NULL,
      phrase_audio_url VARCHAR(1024) NULL,
      source_model VARCHAR(128) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_word_training_generated_phrase (yandex_cache_id, phrase_en),
      KEY idx_word_training_generated_phrases_word (yandex_cache_id, updated_at),
      KEY idx_word_training_generated_phrases_audio (phrase_audio_url(255))
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS exercise_excluded_words (
      id INT AUTO_INCREMENT PRIMARY KEY,
      word_id INT NOT NULL,
      created_by_user_id VARCHAR(191) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_exercise_excluded_word_id (word_id),
      INDEX idx_exercise_excluded_created_by (created_by_user_id)
    )
  `);

  tablesReady = true;
};

const parsePrimaryFromYandex = (
  query: string,
  lang: string,
  response: unknown,
): { word: string; translation: string } | null => {
  const entries = buildYandexEntries(
    query,
    lang === 'ru' ? 'ru' : 'en',
    response as YandexDictResponse,
  );
  if (!entries.length) return null;
  const primary = entries[0];
  if (lang === 'ru') {
    return {
      word: primary.word ?? query,
      translation: query,
    };
  }
  const translation = primary.translations.find((it) => it.trim().length > 0);
  if (!translation) return null;
  return {
    word: primary.word ?? query,
    translation,
  };
};

const collectSourceCandidates = async (userId: string): Promise<SourceCandidate[]> => {
  const [manualRows, viewedRows, exerciseRows] = await Promise.all([
    prisma.$queryRaw<
      Array<{
        sourceRefId: string;
        word: string;
        translation: string;
        sourceUpdatedAt: Date;
        yandexCacheId: number | null;
      }>
    >(Prisma.sql`
      SELECT id AS sourceRefId, word, translation, updatedAt AS sourceUpdatedAt, yandex_cache_id AS yandexCacheId
      FROM user_words
      WHERE userId = ${userId}
      ORDER BY updatedAt DESC
      LIMIT ${SOURCE_LIMIT}
    `),
    prisma.$queryRaw<
      Array<{
        sourceRefId: string;
        query: string;
        lang: string;
        word: string;
        translation: string;
        sourceUpdatedAt: Date;
        yandexCacheId: number | null;
      }>
    >(Prisma.sql`
      SELECT udv.id AS sourceRefId, udv.query, udv.lang, udv.word, udv.translation, udv.updated_at AS sourceUpdatedAt, ydc.id AS yandexCacheId
      FROM user_dictionary_views udv
      LEFT JOIN yandex_dictionary_cache ydc
        ON ydc.query = udv.query AND ydc.lang = udv.lang
      WHERE udv.user_id = ${userId}
      ORDER BY udv.updated_at DESC
      LIMIT ${SOURCE_LIMIT}
    `),
    prisma.$queryRaw<
      Array<{
        yandexCacheId: number;
        touchesTotal: number | null;
        touchesCorrect: number | null;
        sourceUpdatedAt: Date;
        query: string;
        lang: string;
        response: unknown;
      }>
    >(Prisma.sql`
      SELECT
        uwp.word_id AS yandexCacheId,
        uwp.touches_total AS touchesTotal,
        uwp.touches_correct AS touchesCorrect,
        uwp.updated_at AS sourceUpdatedAt,
        ydc.query,
        ydc.lang,
        ydc.response
      FROM user_word_progress uwp
      INNER JOIN yandex_dictionary_cache ydc ON ydc.id = uwp.word_id
      WHERE uwp.user_id = ${userId}
      ORDER BY uwp.updated_at DESC
      LIMIT ${SOURCE_LIMIT}
    `),
  ]);

  const pool = new Map<string, SourceCandidate>();
  const putCandidate = (candidate: SourceCandidate) => {
    const normalizedWord = normalizeWord(candidate.word);
    if (!normalizedWord || !candidate.translation.trim()) return;
    const existing = pool.get(candidate.wordKey);
    if (!existing || candidate.sourceWeight > existing.sourceWeight) {
      pool.set(candidate.wordKey, candidate);
    }
  };

  manualRows.forEach((row) => {
    const key = row.yandexCacheId ? `ydx:${row.yandexCacheId}` : `manual:${row.sourceRefId}`;
    putCandidate({
      wordKey: key,
      word: row.word.trim(),
      translation: row.translation.trim(),
      sourceType: 'manual',
      sourceWeight: 100,
      sourceUpdatedAt: row.sourceUpdatedAt,
      yandexCacheId: row.yandexCacheId,
      mistakeScore: 0,
    });
  });

  viewedRows.forEach((row) => {
    const key = row.yandexCacheId ? `ydx:${row.yandexCacheId}` : `viewed:${row.lang}:${row.query}`;
    putCandidate({
      wordKey: key,
      word: row.word.trim(),
      translation: row.translation.trim(),
      sourceType: 'viewed',
      sourceWeight: 70,
      sourceUpdatedAt: row.sourceUpdatedAt,
      yandexCacheId: row.yandexCacheId,
      mistakeScore: 0,
    });
  });

  exerciseRows.forEach((row) => {
    const primary = parsePrimaryFromYandex(row.query, row.lang, row.response);
    if (!primary) return;
    const touchesTotal = Number(row.touchesTotal ?? 0);
    const touchesCorrect = Number(row.touchesCorrect ?? 0);
    const touchesWrong = Math.max(0, touchesTotal - touchesCorrect);
    const accuracy = touchesTotal > 0 ? touchesCorrect / touchesTotal : 0;
    const mistakeScore = touchesWrong * 3 + Math.round((1 - accuracy) * 10);
    putCandidate({
      wordKey: `ydx:${row.yandexCacheId}`,
      word: primary.word.trim(),
      translation: primary.translation.trim(),
      sourceType: 'exercise',
      sourceWeight: 55,
      sourceUpdatedAt: row.sourceUpdatedAt,
      yandexCacheId: row.yandexCacheId,
      mistakeScore,
    });
  });

  return Array.from(pool.values());
};

const syncProgressFromSources = async (userId: string): Promise<void> => {
  const candidates = await collectSourceCandidates(userId);
  if (!candidates.length) return;

  for (const candidate of candidates) {
    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO word_training_progress (
          user_id,
          word_key,
          word,
          translation,
          source_type,
          source_weight,
          source_updated_at,
          yandex_cache_id,
          status,
          srs_stage,
          ease_factor,
          interval_days
        )
        VALUES (
          ${userId},
          ${candidate.wordKey},
          ${candidate.word},
          ${candidate.translation},
          ${candidate.sourceType},
          ${candidate.sourceWeight},
          ${candidate.sourceUpdatedAt},
          ${candidate.yandexCacheId},
          'new',
          0,
          2.5,
          0
        )
        ON DUPLICATE KEY UPDATE
          word = VALUES(word),
          translation = VALUES(translation),
          source_type = CASE
            WHEN VALUES(source_weight) > source_weight THEN VALUES(source_type)
            ELSE source_type
          END,
          source_weight = GREATEST(source_weight, VALUES(source_weight)),
          source_updated_at = GREATEST(source_updated_at, VALUES(source_updated_at)),
          yandex_cache_id = COALESCE(word_training_progress.yandex_cache_id, VALUES(yandex_cache_id))
      `,
    );
  }
};

const loadProgress = async (userId: string): Promise<ProgressRow[]> =>
  prisma.$queryRaw<ProgressRow[]>(Prisma.sql`
    SELECT
      p.id,
      p.user_id,
      p.word_key,
      p.word,
      p.translation,
      p.source_type,
      p.source_weight,
      p.source_updated_at,
      p.yandex_cache_id,
      p.status,
      p.srs_stage,
      p.ease_factor,
      p.interval_days,
      p.due_at,
      p.last_reviewed_at,
      p.next_due_at,
      p.review_count,
      p.correct_count,
      p.wrong_count,
      p.forgotten_count,
      p.hard_count,
      p.good_count,
      p.easy_count,
      p.last_grade,
      p.created_at,
      p.updated_at,
      ydc.cefr_level
    FROM word_training_progress p
    INNER JOIN yandex_dictionary_cache ydc ON ydc.id = p.yandex_cache_id
    LEFT JOIN user_word_progress uwp
      ON uwp.user_id = p.user_id AND uwp.word_id = p.yandex_cache_id
    LEFT JOIN exercise_excluded_words ex ON ex.word_id = p.yandex_cache_id
    WHERE p.user_id = ${userId}
      AND ydc.cefr_level IS NOT NULL
      AND TRIM(ydc.cefr_level) <> ''
      AND COALESCE(uwp.status, 'new') NOT IN ('known', 'ignored')
      AND ex.word_id IS NULL
  `);

const buildDailyQueue = (
  rows: ProgressRow[],
  requestedTarget: number,
  userLevel: string,
  preferences?: StartSessionPreferences,
): {
  queue: QueueDraftItem[];
  reviewCount: number;
  mistakeCount: number;
  newCount: number;
} => {
  const normalizedUserLevel = normalizeCefrLevel(userLevel) ?? 'A1';
  const levelIndex = CEFR_LEVELS.indexOf(normalizedUserLevel as (typeof CEFR_LEVELS)[number]);
  const lowerLevel = levelIndex > 0 ? CEFR_LEVELS[levelIndex - 1] : null;
  const higherLevel = levelIndex < CEFR_LEVELS.length - 1 ? CEFR_LEVELS[levelIndex + 1] : null;

  const now = Date.now();
  const target = clamp(requestedTarget, SESSION_TARGET_MIN, SESSION_TARGET_MAX);
  const newLimit = Math.max(1, Math.round(target * 0.6));
  const reviewTarget = Math.max(1, target - newLimit);
  const mistakeTarget = Math.max(1, Math.round(target * 0.2));

  const scored = rows.map((row) => {
    const cefrLevel = normalizeCefrLevel(row.cefr_level) ?? 'A1';
    const dueTs = row.due_at?.getTime() ?? 0;
    const overdueHours = dueTs > 0 && dueTs <= now ? Math.floor((now - dueTs) / 3_600_000) : 0;
    const accuracy = row.review_count > 0 ? row.correct_count / row.review_count : 0;
    const interactionBoost =
      preferences?.prioritizeUserInteractions === false
        ? 0
        : row.source_type === 'manual'
        ? 5
        : row.source_type === 'viewed'
        ? 3
        : 1;
    const mistakePressure = row.wrong_count * 3 + Math.round((1 - accuracy) * 10) + interactionBoost;
    return {
      row,
      cefrLevel,
      overdueHours,
      mistakePressure,
    };
  });

  const filtered = scored.filter(({ cefrLevel }) => {
    if (cefrLevel === normalizedUserLevel) return true;
    if (lowerLevel && cefrLevel === lowerLevel) return true;
    if (higherLevel && cefrLevel === higherLevel) return true;
    return false;
  });

  const levelScoped = filtered.length ? filtered : scored;

  const reviewPool = levelScoped
    .filter(
      ({ row }) =>
        (row.due_at && row.due_at.getTime() <= now) ||
        (!row.due_at && (row.status === 'learning' || row.status === 'review')),
    )
    .sort((a, b) => {
      if (b.overdueHours !== a.overdueHours) return b.overdueHours - a.overdueHours;
      if (b.mistakePressure !== a.mistakePressure) return b.mistakePressure - a.mistakePressure;
      return b.row.source_weight - a.row.source_weight;
    });

  const mistakePool = levelScoped
    .filter(
      ({ row, mistakePressure }) =>
        (row.status === 'learning' || row.status === 'review') &&
        (row.wrong_count >= 2 || mistakePressure >= 6),
    )
    .sort((a, b) => {
      if (b.mistakePressure !== a.mistakePressure) return b.mistakePressure - a.mistakePressure;
      return b.row.source_weight - a.row.source_weight;
    });

  const newPool = levelScoped
    .filter(({ row }) => row.status === 'new')
    .sort((a, b) => {
      if (b.row.source_weight !== a.row.source_weight) return b.row.source_weight - a.row.source_weight;
      return b.row.source_updated_at.getTime() - a.row.source_updated_at.getTime();
    });

  const selected = new Set<string>();
  const queue: QueueDraftItem[] = [];
  const lowerWeight = clamp(preferences?.levelMix?.lowerLevelWeight ?? 0.15, 0, 1);
  const higherWeight = clamp(preferences?.levelMix?.higherLevelWeight ?? 0.15, 0, 1);
  const currentWeight = clamp(preferences?.levelMix?.currentLevelWeight ?? 0.7, 0, 1);
  const totalWeight = Math.max(0.0001, lowerWeight + higherWeight + currentWeight);
  const lowerQuota = lowerLevel ? Math.max(1, Math.floor((target * lowerWeight) / totalWeight)) : 0;
  const higherQuota = higherLevel ? Math.max(1, Math.floor((target * higherWeight) / totalWeight)) : 0;
  const currentQuota = Math.max(1, target - lowerQuota - higherQuota);
  const quotas = new Map<string, number>([
    [normalizedUserLevel, currentQuota],
    ...(lowerLevel ? [[lowerLevel, lowerQuota] as const] : []),
    ...(higherLevel ? [[higherLevel, higherQuota] as const] : []),
  ]);
  const taken = new Map<string, number>();
  const canTakeByQuota = (cefrLevel: string): boolean => {
    const quota = quotas.get(cefrLevel);
    if (quota === undefined) return true;
    return (taken.get(cefrLevel) ?? 0) < quota;
  };
  const markTaken = (cefrLevel: string) => {
    taken.set(cefrLevel, (taken.get(cefrLevel) ?? 0) + 1);
  };

  const pushFromPool = (
    pool: typeof reviewPool,
    reason: QueueReason,
    limit: number,
    enforceQuota = true,
  ) => {
    for (const item of pool) {
      if (queue.length >= target) break;
      if (selected.has(item.row.word_key)) continue;
      if (limit <= 0) break;
      if (enforceQuota && !canTakeByQuota(item.cefrLevel)) continue;
      queue.push({
        wordKey: item.row.word_key,
        word: item.row.word,
        translation: item.row.translation,
        sourceType: item.row.source_type,
        yandexCacheId: item.row.yandex_cache_id,
        reason,
        priorityScore: item.overdueHours + item.mistakePressure + item.row.source_weight,
        initialStatus: item.row.status,
        initialStage: item.row.srs_stage,
      });
      selected.add(item.row.word_key);
      markTaken(item.cefrLevel);
      limit -= 1;
    }
  };

  pushFromPool(reviewPool, 'review', reviewTarget);
  pushFromPool(mistakePool, 'mistake', mistakeTarget);
  pushFromPool(newPool, 'new', newLimit);

  if (queue.length < target) {
    pushFromPool(reviewPool, 'review', target, false);
    pushFromPool(mistakePool, 'mistake', target, false);
    pushFromPool(newPool, 'new', target, false);
  }

  if (queue.length < target) {
    const fallback = levelScoped.sort((a, b) => {
      if (b.row.source_weight !== a.row.source_weight) return b.row.source_weight - a.row.source_weight;
      return b.row.source_updated_at.getTime() - a.row.source_updated_at.getTime();
    });
    for (const item of fallback) {
      if (queue.length >= target) break;
      if (selected.has(item.row.word_key)) continue;
      queue.push({
        wordKey: item.row.word_key,
        word: item.row.word,
        translation: item.row.translation,
        sourceType: item.row.source_type,
        yandexCacheId: item.row.yandex_cache_id,
        reason: item.row.status === 'new' ? 'new' : 'review',
        priorityScore: item.row.source_weight + item.mistakePressure,
        initialStatus: item.row.status,
        initialStage: item.row.srs_stage,
      });
      selected.add(item.row.word_key);
    }
  }

  return {
    queue,
    reviewCount: queue.filter((it) => it.reason === 'review').length,
    mistakeCount: queue.filter((it) => it.reason === 'mistake').length,
    newCount: queue.filter((it) => it.reason === 'new').length,
  };
};

const getActiveSession = async (userId: string): Promise<SessionRow | null> => {
  const [row] = await prisma.$queryRaw<SessionRow[]>(Prisma.sql`
    SELECT *
    FROM word_training_sessions
    WHERE user_id = ${userId} AND status = 'active'
    ORDER BY started_at DESC
    LIMIT 1
  `);
  return row ?? null;
};

const getSessionById = async (sessionId: string, userId: string): Promise<SessionRow | null> => {
  const [row] = await prisma.$queryRaw<SessionRow[]>(Prisma.sql`
    SELECT *
    FROM word_training_sessions
    WHERE id = ${sessionId} AND user_id = ${userId}
    LIMIT 1
  `);
  return row ?? null;
};

const getSessionPendingCount = async (sessionId: string): Promise<number> => {
  const [row] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM word_training_session_items
    WHERE session_id = ${sessionId} AND state = 'pending'
  `);
  return Number(row?.total ?? 0);
};

const completeSessionIfNeeded = async (session: SessionRow): Promise<SessionRow> => {
  if (session.status !== 'active') return session;

  const pendingCount = await getSessionPendingCount(session.id);
  if (pendingCount > 0 && session.energy_left > 0) return session;

  await prisma.$transaction(async (tx) => {
    const [fresh] = await tx.$queryRaw<SessionRow[]>(Prisma.sql`
      SELECT *
      FROM word_training_sessions
      WHERE id = ${session.id}
      LIMIT 1
      FOR UPDATE
    `);
    if (!fresh || fresh.status !== 'active') return;

    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_sessions
      SET status = 'completed', completed_at = NOW(3)
      WHERE id = ${fresh.id}
    `);

    if (!fresh.xp_applied && fresh.xp_earned > 0) {
      await tx.user.update({
        where: { id: fresh.user_id },
        data: {
          xpPoints: {
            increment: fresh.xp_earned,
          },
        },
      });
      await tx.$executeRaw(Prisma.sql`
        UPDATE word_training_sessions
        SET xp_applied = 1
        WHERE id = ${fresh.id}
      `);
    }
  });

  const updated = await getSessionById(session.id, session.user_id);
  if (!updated) {
    throw Object.assign(new Error('Session not found after completion'), { status: 500 });
  }
  return updated;
};

const getExamplesByWord = async (
  word: string,
  limit = 3,
  excludeContentId?: number | null,
  paddingSeconds = 2,
  paddingBeforeSeconds?: number,
  paddingAfterSeconds?: number,
): Promise<WordExample[]> => {
  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) return [];

  const result = await videoLearningService.searchPhrase(
    normalizedWord,
    Math.max(1, limit),
    clamp(Math.floor(paddingSeconds), 0, 10),
    undefined,
    Math.max(10, limit * 4),
    undefined,
    typeof paddingBeforeSeconds === 'number' ? clamp(Math.floor(paddingBeforeSeconds), 0, 10) : undefined,
    typeof paddingAfterSeconds === 'number' ? clamp(Math.floor(paddingAfterSeconds), 0, 10) : undefined,
  );

  const mapped = result.items.map((item) => ({
    contentId: Number(item.contentId),
    videoName: item.videoName,
    videoUrl: item.videoUrl ?? null,
    startSeconds: Number.isFinite(item.startSeconds) ? item.startSeconds : null,
    endSeconds: Number.isFinite(item.endSeconds) ? item.endSeconds : null,
    text: item.contextText || item.matchedText || '',
  }));

  if (!excludeContentId) {
    return mapped.slice(0, limit);
  }

  return mapped.filter((item) => item.contentId !== excludeContentId).slice(0, limit);
};

const getCurrentItem = async (sessionId: string): Promise<SessionItemRow | null> => {
  const [row] = await prisma.$queryRaw<SessionItemRow[]>(Prisma.sql`
    SELECT *
    FROM word_training_session_items
    WHERE session_id = ${sessionId} AND state = 'pending'
    ORDER BY queue_order ASC
    LIMIT 1
  `);
  return row ?? null;
};

const getQueuePosition = async (sessionId: string, itemId: number): Promise<{ position: number; total: number }> => {
  const [row] = await prisma.$queryRaw<Array<{ position: bigint; total: bigint }>>(Prisma.sql`
    SELECT
      (
        SELECT COUNT(*)
        FROM word_training_session_items i2
        WHERE i2.session_id = i.session_id AND i2.queue_order <= i.queue_order
      ) AS position,
      (
        SELECT COUNT(*)
        FROM word_training_session_items i3
        WHERE i3.session_id = i.session_id
      ) AS total
    FROM word_training_session_items i
    WHERE i.id = ${itemId}
    LIMIT 1
  `);
  return {
    position: Number(row?.position ?? 1),
    total: Number(row?.total ?? 1),
  };
};

const getRecognitionOptions = async (
  userId: string,
  wordKey: string,
  correctTranslation: string,
): Promise<string[]> => {
  const correct = correctTranslation.trim();
  if (!correct) return [];

  const rows = await prisma.$queryRaw<Array<{ translation: string }>>(Prisma.sql`
    SELECT p.translation AS translation
    FROM word_training_progress p
    INNER JOIN yandex_dictionary_cache ydc ON ydc.id = p.yandex_cache_id
    LEFT JOIN exercise_excluded_words ex ON ex.word_id = p.yandex_cache_id
    WHERE p.user_id = ${userId}
      AND p.word_key <> ${wordKey}
      AND p.translation IS NOT NULL
      AND TRIM(p.translation) <> ''
      AND ydc.cefr_level IS NOT NULL
      AND TRIM(ydc.cefr_level) <> ''
      AND ex.word_id IS NULL
    ORDER BY RAND()
    LIMIT 40
  `);

  const correctNorm = normalizeOptionText(correct);
  const seen = new Set<string>([correctNorm]);
  const distractors: string[] = [];
  for (const row of rows) {
    const candidate = row.translation.trim();
    const norm = normalizeOptionText(candidate);
    if (!candidate || !norm || seen.has(norm)) continue;
    seen.add(norm);
    distractors.push(candidate);
    if (distractors.length >= 3) break;
  }

  return shuffleArray([correct, ...distractors]).slice(0, 4);
};

const getPronunciationAudioUrl = async (
  yandexCacheId: number | null,
  word: string,
): Promise<string | null> => {
  if (yandexCacheId) {
    const [row] = await prisma.$queryRaw<Array<{ audioUrl: string | null }>>(Prisma.sql`
      SELECT pronunciation_audio_url AS audioUrl
      FROM yandex_dictionary_cache
      WHERE id = ${yandexCacheId}
      LIMIT 1
    `);
    if (row?.audioUrl && row.audioUrl.trim()) return row.audioUrl.trim();
  }

  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) return null;

  const [fallback] = await prisma.$queryRaw<Array<{ audioUrl: string | null }>>(Prisma.sql`
    SELECT pronunciation_audio_url AS audioUrl
    FROM yandex_dictionary_cache
    WHERE LOWER(query) = ${normalizedWord}
      AND LOWER(lang) REGEXP '^en([_-].+)?$'
      AND pronunciation_audio_url IS NOT NULL
      AND TRIM(pronunciation_audio_url) <> ''
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  return fallback?.audioUrl?.trim() || null;
};

const getWordCefrLevel = async (
  yandexCacheId: number | null,
  word: string,
): Promise<string | null> => {
  if (yandexCacheId) {
    const [row] = await prisma.$queryRaw<Array<{ cefrLevel: string | null }>>(Prisma.sql`
      SELECT cefr_level AS cefrLevel
      FROM yandex_dictionary_cache
      WHERE id = ${yandexCacheId}
      LIMIT 1
    `);
    const normalized = normalizeCefrLevel(row?.cefrLevel ?? null);
    if (normalized) return normalized;
  }

  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) return null;
  const [fallback] = await prisma.$queryRaw<Array<{ cefrLevel: string | null }>>(Prisma.sql`
    SELECT cefr_level AS cefrLevel
    FROM yandex_dictionary_cache
    WHERE LOWER(query) = ${normalizedWord}
      AND LOWER(lang) REGEXP '^en([_-].+)?$'
      AND cefr_level IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  return normalizeCefrLevel(fallback?.cefrLevel ?? null);
};

const getAlternativeTranslations = async (
  yandexCacheId: number | null,
  word: string,
  primaryTranslation: string,
): Promise<string[]> => {
  const normalizedPrimary = normalizeOptionText(primaryTranslation);
  let responseJson: unknown = null;
  let queryWord = word;

  if (yandexCacheId) {
    const [row] = await prisma.$queryRaw<Array<{ responseJson: unknown; query: string }>>(Prisma.sql`
      SELECT response AS responseJson, query
      FROM yandex_dictionary_cache
      WHERE id = ${yandexCacheId}
      LIMIT 1
    `);
    responseJson = row?.responseJson ?? null;
    queryWord = row?.query?.trim() || word;
  } else {
    const normalizedWord = normalizeWord(word);
    if (!normalizedWord) return [];
    const [row] = await prisma.$queryRaw<Array<{ responseJson: unknown; query: string }>>(Prisma.sql`
      SELECT response AS responseJson, query
      FROM yandex_dictionary_cache
      WHERE LOWER(query) = ${normalizedWord}
        AND LOWER(lang) REGEXP '^en([_-].+)?$'
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    responseJson = row?.responseJson ?? null;
    queryWord = row?.query?.trim() || word;
  }

  if (!responseJson) return [];
  const entries = buildYandexEntries(queryWord, 'en', responseJson as YandexDictResponse);
  const candidates = entries[0]?.translations ?? [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const trimmed = normalizeText(candidate);
    const key = normalizeOptionText(trimmed);
    if (!trimmed || !key || key === normalizedPrimary || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= 5) break;
  }
  return out;
};

const getGeneratedPhraseForWord = async (
  yandexCacheId: number | null,
  word: string,
  options?: {
    excludePhraseEns?: string[];
  },
): Promise<GeneratedPhrase | null> => {
  const excludePhraseEns = (options?.excludePhraseEns ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const hasExclude = excludePhraseEns.length > 0;

  if (yandexCacheId) {
    const [row] = await prisma.$queryRaw<
      Array<{ phraseEn: string; phraseRu: string | null; phraseAudioUrl: string | null }>
    >(Prisma.sql`
      SELECT phrase_en AS phraseEn, phrase_ru AS phraseRu, phrase_audio_url AS phraseAudioUrl
      FROM word_training_generated_phrases
      WHERE yandex_cache_id = ${yandexCacheId}
        ${hasExclude ? Prisma.sql`AND phrase_en NOT IN (${Prisma.join(excludePhraseEns)})` : Prisma.empty}
      ORDER BY RAND()
      LIMIT 1
    `);
    if (row?.phraseEn?.trim()) {
      return {
        phraseEn: row.phraseEn.trim(),
        phraseRu: row.phraseRu?.trim() || null,
        phraseAudioUrl: row.phraseAudioUrl?.trim() || null,
      };
    }
  }

  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) return null;

  const [fallback] = await prisma.$queryRaw<
    Array<{ phraseEn: string; phraseRu: string | null; phraseAudioUrl: string | null }>
  >(Prisma.sql`
    SELECT phrase_en AS phraseEn, phrase_ru AS phraseRu, phrase_audio_url AS phraseAudioUrl
    FROM word_training_generated_phrases
    WHERE LOWER(word) = ${normalizedWord}
      ${hasExclude ? Prisma.sql`AND phrase_en NOT IN (${Prisma.join(excludePhraseEns)})` : Prisma.empty}
    ORDER BY RAND()
    LIMIT 1
  `);

  if (!fallback?.phraseEn?.trim()) return null;
  return {
    phraseEn: fallback.phraseEn.trim(),
    phraseRu: fallback.phraseRu?.trim() || null,
    phraseAudioUrl: fallback.phraseAudioUrl?.trim() || null,
  };
};

const cleanWordToken = (token: string): string =>
  token
    .replace(/^[^A-Za-z'-]+/g, '')
    .replace(/[^A-Za-z'-]+$/g, '')
    .trim();

const buildSentenceTokens = (sentence: string): string[] =>
  sentence
    .split(/\s+/)
    .map((token) => cleanWordToken(token))
    .filter((token) => token.length > 0 && /[A-Za-z]/.test(token))
    .slice(0, 12);

const getDistractorWords = async (excludeWord: string, take = 3): Promise<string[]> => {
  const normalizedExclude = normalizeWord(excludeWord);
  const rows = await prisma.$queryRaw<Array<{ word: string }>>(Prisma.sql`
    SELECT query AS word
    FROM yandex_dictionary_cache
    WHERE LOWER(lang) REGEXP '^en([_-].+)?$'
      AND query REGEXP '[A-Za-z]'
      AND LOWER(query) <> ${normalizedExclude}
      AND cefr_level IS NOT NULL
      AND TRIM(cefr_level) <> ''
    ORDER BY RAND()
    LIMIT 120
  `);

  const seen = new Set<string>([normalizedExclude]);
  const out: string[] = [];
  for (const row of rows) {
    const candidate = normalizeText(row.word);
    const key = normalizeWord(candidate);
    if (!candidate || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
    if (out.length >= take) break;
  }
  return out;
};

const getFallbackPairsFromYandex = async (
  excludeWordKey: string,
  needed: number,
): Promise<Array<{ word: string; translation: string; yandexCacheId: number | null }>> => {
  const rows = await prisma.$queryRaw<
    Array<{ yandexCacheId: number; word: string; response: unknown }>
  >(Prisma.sql`
    SELECT id AS yandexCacheId, query AS word, response
    FROM yandex_dictionary_cache
    WHERE LOWER(lang) REGEXP '^en([_-].+)?$'
      AND query REGEXP '[A-Za-z]'
      AND LOWER(query) <> ${excludeWordKey}
      AND cefr_level IS NOT NULL
      AND TRIM(cefr_level) <> ''
    ORDER BY RAND()
    LIMIT 120
  `);

  const out: Array<{ word: string; translation: string; yandexCacheId: number | null }> = [];
  const seenWords = new Set<string>([excludeWordKey]);
  const seenTranslations = new Set<string>();

  for (const row of rows) {
    const normalizedWord = normalizeWord(row.word);
    if (!normalizedWord || seenWords.has(normalizedWord)) continue;

    const response =
      typeof row.response === 'string'
        ? (JSON.parse(row.response || '{}') as YandexDictResponse)
        : ((row.response ?? {}) as YandexDictResponse);
    const entries = buildYandexEntries(normalizedWord, 'en', response);
    const translation = normalizeText(entries[0]?.translations?.[0] || '');
    const translationKey = normalizeOptionText(translation);
    if (!translation || !translationKey || seenTranslations.has(translationKey)) continue;

    seenWords.add(normalizedWord);
    seenTranslations.add(translationKey);
    out.push({
      word: normalizeText(row.word),
      translation,
      yandexCacheId: Number(row.yandexCacheId),
    });
    if (out.length >= needed) break;
  }
  return out;
};

const buildMissingExercise = async (
  sentence: string,
  sentenceTranslation: string | null,
  targetWord: string,
  phraseAudioUrl: string | null,
): Promise<MissingExercisePayload> => {
  const rawTokens = sentence.split(/\s+/).map((x) => x.trim()).filter(Boolean);
  const candidates = rawTokens
    .map((raw, idx) => ({ idx, clean: cleanWordToken(raw) }))
    .filter((item) => item.clean.length > 0 && /[A-Za-z]/.test(item.clean));

  const picked = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : { idx: 0, clean: targetWord };
  const correctWord = normalizeText(picked.clean || targetWord);

  const sentenceWithBlank = rawTokens
    .map((token, idx) => (idx === picked.idx ? '_____' : token))
    .join(' ');

  const distractors = await getDistractorWords(correctWord, 3);
  const options = shuffleArray([correctWord, ...distractors]).slice(0, 4);

  return {
    type: 'missing',
    sentence,
    sentenceWithBlank,
    sentenceTranslation,
    options,
    correctWord,
    targetWord,
    phraseAudioUrl,
  };
};

const buildAudioAssembleExercise = async (
  sentence: string,
  sentenceTranslation: string | null,
  targetWord: string,
  phraseAudioUrl: string | null,
): Promise<AudioAssembleExercisePayload> => {
  const targetTokens = buildSentenceTokens(sentence);
  const targetKeys = new Set(targetTokens.map((token) => normalizeWord(token)));
  const distractorTake = targetTokens.length >= 5 ? 2 : 1;
  const rawDistractors = await getDistractorWords(targetWord, distractorTake + 3);
  const distractors: string[] = [];
  for (const candidate of rawDistractors) {
    const key = normalizeWord(candidate);
    if (!key || targetKeys.has(key)) continue;
    distractors.push(candidate);
    if (distractors.length >= distractorTake) break;
  }

  const assembleTokens = shuffleArray([...targetTokens, ...distractors]);
  return {
    type: 'audio_assemble',
    sentence,
    sentenceTranslation,
    phraseAudioUrl,
    assembleTokens,
    targetTokens,
    targetWord,
  };
};

const buildMatchPairsExercise = async (
  userId: string,
  current: { wordKey: string; word: string; translation: string; yandexCacheId: number | null },
): Promise<MatchPairsExercisePayload> => {
  const base: Array<{ word: string; translation: string; yandexCacheId: number | null }> = [
    {
      word: normalizeText(current.word),
      translation: normalizeText(current.translation),
      yandexCacheId: current.yandexCacheId,
    },
  ];

  const distractors = await prisma.$queryRaw<
    Array<{ word: string; translation: string; yandexCacheId: number | null }>
  >(Prisma.sql`
    SELECT p.word AS word, p.translation AS translation, p.yandex_cache_id AS yandexCacheId
    FROM word_training_progress p
    INNER JOIN yandex_dictionary_cache ydc ON ydc.id = p.yandex_cache_id
    LEFT JOIN exercise_excluded_words ex ON ex.word_id = p.yandex_cache_id
    WHERE p.user_id = ${userId}
      AND p.word_key <> ${current.wordKey}
      AND p.word IS NOT NULL
      AND TRIM(p.word) <> ''
      AND p.translation IS NOT NULL
      AND TRIM(p.translation) <> ''
      AND ydc.cefr_level IS NOT NULL
      AND TRIM(ydc.cefr_level) <> ''
      AND ex.word_id IS NULL
    ORDER BY RAND()
    LIMIT 40
  `);

  const seenWords = new Set<string>([normalizeWord(current.word)]);
  const seenTranslations = new Set<string>([normalizeOptionText(current.translation)]);

  for (const row of distractors) {
    const word = normalizeText(row.word);
    const translation = normalizeText(row.translation);
    const wk = normalizeWord(word);
    const tk = normalizeOptionText(translation);
    if (!word || !translation || !wk || !tk) continue;
    if (seenWords.has(wk) || seenTranslations.has(tk)) continue;
    seenWords.add(wk);
    seenTranslations.add(tk);
    base.push({ word, translation, yandexCacheId: row.yandexCacheId ? Number(row.yandexCacheId) : null });
    if (base.length >= 4) break;
  }

  if (base.length < 4) {
    const fallback = await getFallbackPairsFromYandex(normalizeWord(current.word), 4 - base.length);
    for (const row of fallback) {
      const wk = normalizeWord(row.word);
      const tk = normalizeOptionText(row.translation);
      if (!wk || !tk || seenWords.has(wk) || seenTranslations.has(tk)) continue;
      seenWords.add(wk);
      seenTranslations.add(tk);
      base.push(row);
      if (base.length >= 4) break;
    }
  }

  const trimmed = base.slice(0, 4);
  const pairs = await Promise.all(
    trimmed.map(async (row) => ({
      word: row.word,
      translation: row.translation,
      pronunciationAudioUrl: await getPronunciationAudioUrl(row.yandexCacheId, row.word),
    })),
  );

  return {
    type: 'match_pairs',
    targetWord: current.word,
    pairs,
    shuffledTranslations: shuffleTranslationsWithDerangement(pairs),
  };
};

const mapTask = async (userId: string, sessionId: string, item: SessionItemRow) => {
  const itemId = Number(item.id);
  const position = await getQueuePosition(sessionId, itemId);
  let context = null as null | WordExample;
  const wordPronunciationAudioUrl = await getPronunciationAudioUrl(item.yandex_cache_id, item.word);
  const wordCefrLevel = await getWordCefrLevel(item.yandex_cache_id, item.word);
  const otherTranslations = await getAlternativeTranslations(item.yandex_cache_id, item.word, item.translation);

  if (item.context_content_id && item.context_text) {
    const [contentRow] = await prisma.$queryRaw<
      Array<{ videoName: string; videoUrl: string | null }>
    >(Prisma.sql`
      SELECT video_name AS videoName, video_url AS videoUrl
      FROM video_learning_content
      WHERE id = ${item.context_content_id}
      LIMIT 1
    `);
    context = {
      contentId: item.context_content_id,
      videoName: contentRow?.videoName ?? '',
      videoUrl: contentRow?.videoUrl ?? null,
      startSeconds: item.context_start_seconds,
      endSeconds: item.context_end_seconds,
      text: item.context_text,
    };
  } else {
    const examples = await getExamplesByWord(item.word, 1);
    context = examples[0] ?? null;
    if (context) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE word_training_session_items
        SET
          context_content_id = ${context.contentId},
          context_start_seconds = ${context.startSeconds},
          context_end_seconds = ${context.endSeconds},
          context_text = ${context.text}
        WHERE id = ${item.id}
      `);
    }
  }

  if (item.phase === 'recognition') {
    const recognitionOptions = await getRecognitionOptions(userId, item.word_key, item.translation);
    return {
      mode: 'recognition' as const,
      itemId,
      wordKey: item.word_key,
      yandexCacheId: item.yandex_cache_id,
      word: item.word,
      translation: item.translation,
      sourceType: item.source_type,
      reason: item.reason,
      attemptCount: item.attempt_count,
      queuePosition: position.position,
      queueTotal: position.total,
      context,
      pronunciationAudioUrl: wordPronunciationAudioUrl,
      cefrLevel: wordCefrLevel,
      isNewWord: item.initial_status === 'new',
      otherTranslations,
      recognitionOptions,
      showReinforcementAfter:
        item.initial_stage >= 2 ||
        item.initial_status === 'review' ||
        item.initial_status === 'mastered',
    };
  }

  const [matchPairsRow] = await prisma.$queryRaw<Array<{ countItems: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS countItems
    FROM word_training_session_items
    WHERE session_id = ${sessionId}
      AND reinforcement_type = 'match_pairs'
      AND id <> ${item.id}
  `);
  const hasMatchPairsInSession = Number(matchPairsRow?.countItems ?? 0) > 0;

  let reinforcementType: ExerciseType;
  const shouldInsertSingleMatchPairs =
    !hasMatchPairsInSession && position.position >= Math.max(2, Math.ceil(position.total * 0.6));
  if (shouldInsertSingleMatchPairs) {
    reinforcementType = 'match_pairs';
  } else {
    const itemIdSeed = Number(item.id ?? 0);
    reinforcementType = pickPhraseReinforcementType(
      item.word_key,
      itemIdSeed + item.queue_order + item.attempt_count,
    );
  }

  if (item.reinforcement_type !== reinforcementType) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE word_training_session_items
      SET reinforcement_type = ${reinforcementType}
      WHERE id = ${item.id}
    `);
  }

  let generatedPhrase: GeneratedPhrase | null = null;
  if (item.reinforcement_sentence_en?.trim()) {
    generatedPhrase = {
      phraseEn: item.reinforcement_sentence_en.trim(),
      phraseRu: item.reinforcement_sentence_ru?.trim() || null,
      phraseAudioUrl: item.reinforcement_phrase_audio_url?.trim() || null,
    };
  } else {
    const excludePhraseEns =
      item.reason === 'retry'
        ? []
        : (
            await prisma.$queryRaw<Array<{ phraseEn: string }>>(Prisma.sql`
              SELECT reinforcement_sentence_en AS phraseEn
              FROM word_training_session_items
              WHERE session_id = ${sessionId}
                AND word_key = ${item.word_key}
                AND id <> ${item.id}
                AND reinforcement_sentence_en IS NOT NULL
                AND TRIM(reinforcement_sentence_en) <> ''
                AND reason <> 'retry'
            `)
          ).map((row) => row.phraseEn);

    generatedPhrase = await getGeneratedPhraseForWord(item.yandex_cache_id, item.word, {
      excludePhraseEns,
    });

    if (generatedPhrase) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE word_training_session_items
        SET
          reinforcement_sentence_en = ${generatedPhrase.phraseEn},
          reinforcement_sentence_ru = ${generatedPhrase.phraseRu},
          reinforcement_phrase_audio_url = ${generatedPhrase.phraseAudioUrl}
        WHERE id = ${item.id}
      `);
    }
  }

  const reinforcementSentence = generatedPhrase?.phraseEn || context?.text || `${item.word} ${item.translation}`;
  const reinforcementSentenceTranslation = generatedPhrase?.phraseRu || item.translation;
  const reinforcementAudioUrl = generatedPhrase?.phraseAudioUrl || wordPronunciationAudioUrl;
  let reinforcement: MissingExercisePayload | AudioAssembleExercisePayload | MatchPairsExercisePayload;
  if (reinforcementType === 'missing') {
    reinforcement = await buildMissingExercise(
      reinforcementSentence,
      reinforcementSentenceTranslation,
      item.word,
      reinforcementAudioUrl,
    );
  } else if (reinforcementType === 'audio_assemble') {
    reinforcement = await buildAudioAssembleExercise(
      reinforcementSentence,
      reinforcementSentenceTranslation,
      item.word,
      reinforcementAudioUrl,
    );
  } else {
    reinforcement = await buildMatchPairsExercise(userId, {
      wordKey: item.word_key,
      word: item.word,
      translation: item.translation,
      yandexCacheId: item.yandex_cache_id,
    });
  }

  return {
    mode: 'reinforcement' as const,
    itemId,
    wordKey: item.word_key,
    yandexCacheId: item.yandex_cache_id,
    word: item.word,
    translation: item.translation,
    sourceType: item.source_type,
    reason: item.reason,
    queuePosition: position.position,
    queueTotal: position.total,
    context,
    pronunciationAudioUrl: reinforcementAudioUrl,
    cefrLevel: wordCefrLevel,
    reinforcement,
  };
};

const buildSessionState = async (session: SessionRow) => {
  const fresh = await completeSessionIfNeeded(session);
  const pendingCount = await getSessionPendingCount(fresh.id);

  if (fresh.status !== 'active' || pendingCount <= 0 || fresh.energy_left <= 0) {
    const today = getTodayDateOnly();
    const [dailyRow] = await prisma.$queryRaw<Array<{ totalXp: bigint; totalWords: bigint }>>(Prisma.sql`
      SELECT
        COALESCE(SUM(xp_earned), 0) AS totalXp,
        COALESCE(SUM(words_completed), 0) AS totalWords
      FROM word_training_sessions
      WHERE user_id = ${fresh.user_id}
        AND DATE(started_at) = ${today}
      AND status = 'completed'
    `);
    const completedWords = await prisma.$queryRaw<
      Array<{
        wordKey: string;
        word: string;
        translation: string;
        cefrLevel: string | null;
      }>
    >(Prisma.sql`
      SELECT
        si.word_key AS wordKey,
        MAX(si.word) AS word,
        MAX(si.translation) AS translation,
        MAX(ydc.cefr_level) AS cefrLevel
      FROM word_training_session_items si
      LEFT JOIN yandex_dictionary_cache ydc ON ydc.id = si.yandex_cache_id
      WHERE si.session_id = ${fresh.id}
        AND (
          si.reinforcement_correct = 1
          OR (si.recognition_grade IS NOT NULL AND si.recognition_grade <> 'again')
        )
      GROUP BY si.word_key
      ORDER BY MAX(si.queue_order) ASC
      LIMIT 20
    `);

    return {
      session: {
        id: fresh.id,
        status: fresh.status,
        targetWords: fresh.target_words,
        energyStart: fresh.energy_start,
        energyLeft: fresh.energy_left,
        reviewPlanned: fresh.review_planned,
        mistakePlanned: fresh.mistake_planned,
        newPlanned: fresh.new_planned,
        wordsCompleted: fresh.words_completed,
        xpEarned: fresh.xp_earned,
        startedAt: fresh.started_at,
        completedAt: fresh.completed_at,
      },
      task: null,
      summary: {
        totalXpToday: Number(dailyRow?.totalXp ?? 0),
        totalWordsToday: Number(dailyRow?.totalWords ?? 0),
        completedWords: completedWords.map((row) => ({
          wordKey: row.wordKey,
          word: row.word,
          translation: row.translation,
          cefrLevel: normalizeCefrLevel(row.cefrLevel),
        })),
      },
    };
  }

  const item = await getCurrentItem(fresh.id);
  const [pendingPhase] = await prisma.$queryRaw<Array<{ pendingRetry: bigint; pendingRegular: bigint }>>(Prisma.sql`
    SELECT
      SUM(CASE WHEN state = 'pending' AND reason = 'retry' THEN 1 ELSE 0 END) AS pendingRetry,
      SUM(CASE WHEN state = 'pending' AND reason <> 'retry' THEN 1 ELSE 0 END) AS pendingRegular
    FROM word_training_session_items
    WHERE session_id = ${fresh.id}
  `);
  const retryPhaseActive =
    Number(pendingPhase?.pendingRetry ?? 0) > 0 && Number(pendingPhase?.pendingRegular ?? 0) === 0;
  return {
    session: {
      id: fresh.id,
      status: fresh.status,
      targetWords: fresh.target_words,
      energyStart: fresh.energy_start,
      energyLeft: fresh.energy_left,
      reviewPlanned: fresh.review_planned,
      mistakePlanned: fresh.mistake_planned,
      newPlanned: fresh.new_planned,
      wordsCompleted: fresh.words_completed,
      xpEarned: fresh.xp_earned,
      startedAt: fresh.started_at,
      completedAt: fresh.completed_at,
    },
    task: item ? await mapTask(fresh.user_id, fresh.id, item) : null,
    retryPhase: retryPhaseActive,
    retryPhaseTitle: retryPhaseActive ? 'Закрепляем ошибки' : null,
  };
};

const loadOverview = async (userId: string) => {
  await ensureWordTrainingTables();
  await syncProgressFromSources(userId);

  const [countsRow] = await prisma.$queryRaw<
    Array<{
      dueCount: bigint;
      mistakeCount: bigint;
      newCount: bigint;
      masteredCount: bigint;
      knownCount: bigint;
    }>
  >(Prisma.sql`
    SELECT
      SUM(CASE WHEN p.status IN ('learning', 'review') AND (p.due_at IS NULL OR p.due_at <= NOW(3)) THEN 1 ELSE 0 END) AS dueCount,
      SUM(CASE WHEN p.wrong_count > 0 THEN 1 ELSE 0 END) AS mistakeCount,
      SUM(CASE WHEN p.status = 'new' THEN 1 ELSE 0 END) AS newCount,
      SUM(CASE WHEN p.status = 'mastered' THEN 1 ELSE 0 END) AS masteredCount,
      COUNT(*) AS knownCount
    FROM word_training_progress p
    INNER JOIN yandex_dictionary_cache ydc ON ydc.id = p.yandex_cache_id
    LEFT JOIN exercise_excluded_words ex ON ex.word_id = p.yandex_cache_id
    WHERE p.user_id = ${userId}
      AND ydc.cefr_level IS NOT NULL
      AND TRIM(ydc.cefr_level) <> ''
      AND ex.word_id IS NULL
  `);

  const today = getTodayDateOnly();
  const [todayRow] = await prisma.$queryRaw<
    Array<{ wordsDone: bigint; xpGained: bigint; sessionsDone: bigint }>
  >(Prisma.sql`
    SELECT
      COALESCE(SUM(words_completed), 0) AS wordsDone,
      COALESCE(SUM(xp_earned), 0) AS xpGained,
      COUNT(*) AS sessionsDone
    FROM word_training_sessions
    WHERE user_id = ${userId}
      AND DATE(started_at) = ${today}
      AND status = 'completed'
  `);

  const dueCount = Number(countsRow?.dueCount ?? 0);
  const newCount = Number(countsRow?.newCount ?? 0);
  const targetWords = clamp(
    Math.max(15, Math.min(SESSION_TARGET_MAX, dueCount + Math.min(7, newCount))),
    SESSION_TARGET_MIN,
    SESSION_TARGET_MAX,
  );

  const activeSession = await getActiveSession(userId);
  return {
    dueCount,
    mistakeCount: Number(countsRow?.mistakeCount ?? 0),
    newCount,
    masteredCount: Number(countsRow?.masteredCount ?? 0),
    trackedWords: Number(countsRow?.knownCount ?? 0),
    suggestedTargetWords: targetWords,
    todayProgress: {
      wordsDone: Number(todayRow?.wordsDone ?? 0),
      xpGained: Number(todayRow?.xpGained ?? 0),
      sessionsDone: Number(todayRow?.sessionsDone ?? 0),
    },
    activeSession: activeSession
      ? {
          id: activeSession.id,
          energyLeft: activeSession.energy_left,
          wordsCompleted: activeSession.words_completed,
          targetWords: activeSession.target_words,
        }
      : null,
  };
};

const startSession = async (
  userId: string,
  targetWords?: number,
  preferences?: StartSessionPreferences,
) => {
  await ensureWordTrainingTables();

  const existing = await getActiveSession(userId);
  if (existing) {
    return buildSessionState(existing);
  }

  await syncProgressFromSources(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { level: true },
  });
  const progressRows = await loadProgress(userId);
  if (!progressRows.length) {
    throw Object.assign(new Error('Нет слов для тренировки. Добавьте слова в словарь или откройте переводы в видео.'), {
      status: 400,
    });
  }

  const requestedTarget = clamp(
    targetWords ?? SESSION_TARGET_DEFAULT,
    SESSION_TARGET_MIN,
    SESSION_TARGET_MAX,
  );
  const effectiveLevel = preferences?.cefrLevel ?? normalizeCefrLevel(user?.level) ?? 'A1';
  const queueBuild = buildDailyQueue(progressRows, requestedTarget, effectiveLevel, preferences);
  const maxUniqueWords = clamp(preferences?.maxUniqueWords ?? 5, 1, 5);
  queueBuild.queue = queueBuild.queue.slice(0, maxUniqueWords);
  queueBuild.queue = shuffleArray(queueBuild.queue);
  queueBuild.reviewCount = queueBuild.queue.filter((it) => it.reason === 'review').length;
  queueBuild.mistakeCount = queueBuild.queue.filter((it) => it.reason === 'mistake').length;
  queueBuild.newCount = queueBuild.queue.filter((it) => it.reason === 'new').length;
  const phraseExercisesPerWord = clamp(
    Math.floor(preferences?.reinforcementMode?.phraseExercisesPerWord ?? PHRASE_EXERCISES_PER_WORD_DEFAULT),
    1,
    PHRASE_EXERCISES_PER_WORD_MAX,
  );
  if (!queueBuild.queue.length) {
    throw Object.assign(new Error('Сегодня нет слов для тренировки. Возвращайтесь позже.'), {
      status: 400,
    });
  }

  const sessionId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO word_training_sessions (
        id,
        user_id,
        status,
        target_words,
        phrase_exercises_per_word,
        energy_start,
        energy_left,
        review_planned,
        mistake_planned,
        new_planned
      )
      VALUES (
        ${sessionId},
        ${userId},
        'active',
        ${queueBuild.queue.length},
        ${phraseExercisesPerWord},
        ${SESSION_ENERGY_START},
        ${SESSION_ENERGY_START},
        ${queueBuild.reviewCount},
        ${queueBuild.mistakeCount},
        ${queueBuild.newCount}
      )
    `);

    for (let i = 0; i < queueBuild.queue.length; i += 1) {
      const item = queueBuild.queue[i];
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO word_training_session_items (
          session_id,
          queue_order,
          word_key,
          word,
          translation,
          source_type,
          yandex_cache_id,
          reason,
          priority_score,
          initial_status,
          initial_stage,
          phase,
          state
        )
        VALUES (
          ${sessionId},
          ${i + 1},
          ${item.wordKey},
          ${item.word},
          ${item.translation},
          ${item.sourceType},
          ${item.yandexCacheId},
          ${item.reason},
          ${item.priorityScore},
          ${item.initialStatus},
          ${item.initialStage},
          'recognition',
          'pending'
        )
      `);
    }
  });

  const created = await getSessionById(sessionId, userId);
  if (!created) {
    throw Object.assign(new Error('Failed to start session'), { status: 500 });
  }
  return buildSessionState(created);
};

const submitRecognition = async (
  userId: string,
  sessionId: string,
  input: { itemId: number; grade: RecognitionGrade },
) => {
  await ensureWordTrainingTables();

  const session = await getSessionById(sessionId, userId);
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
  if (session.status !== 'active') throw Object.assign(new Error('Session already finished'), { status: 400 });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const [item] = await tx.$queryRaw<SessionItemRow[]>(Prisma.sql`
      SELECT *
      FROM word_training_session_items
      WHERE id = ${input.itemId} AND session_id = ${sessionId}
      LIMIT 1
      FOR UPDATE
    `);
    if (!item) {
      throw Object.assign(new Error('Session item not found'), { status: 404 });
    }
    if (item.state !== 'pending' || item.phase !== 'recognition') {
      throw Object.assign(new Error('Current step is not recognition'), { status: 400 });
    }

    const [progress] = await tx.$queryRaw<ProgressRow[]>(Prisma.sql`
      SELECT *
      FROM word_training_progress
      WHERE user_id = ${userId} AND word_key = ${item.word_key}
      LIMIT 1
      FOR UPDATE
    `);
    if (!progress) {
      throw Object.assign(new Error('Word progress not found'), { status: 404 });
    }

    const srs = calculateSrsAfterGrade(progress, input.grade, now);
    const nextAttempts = item.attempt_count + 1;
    const shouldRetry = input.grade === 'again' && nextAttempts < MAX_RETRY_ATTEMPTS;
    const phraseRounds = clamp(
      Math.floor(session.phrase_exercises_per_word || PHRASE_EXERCISES_PER_WORD_DEFAULT),
      1,
      PHRASE_EXERCISES_PER_WORD_MAX,
    );
    const needsReinforcement = input.grade !== 'again';

    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_progress
      SET
        status = ${srs.nextStatus},
        srs_stage = ${srs.nextStage},
        ease_factor = ${srs.nextEase},
        interval_days = ${srs.nextIntervalDays},
        due_at = ${srs.nextDueAt},
        last_reviewed_at = ${now},
        next_due_at = ${srs.nextDueAt},
        review_count = review_count + ${srs.reviewDelta},
        correct_count = correct_count + ${srs.correctDelta},
        wrong_count = wrong_count + ${srs.wrongDelta},
        forgotten_count = forgotten_count + ${input.grade === 'again' ? 1 : 0},
        hard_count = hard_count + ${input.grade === 'hard' ? 1 : 0},
        good_count = good_count + ${input.grade === 'good' ? 1 : 0},
        easy_count = easy_count + ${input.grade === 'easy' ? 1 : 0},
        last_grade = ${input.grade}
      WHERE id = ${progress.id}
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_session_items
      SET
        recognition_grade = ${input.grade},
        recognition_at = ${now},
        attempt_count = ${nextAttempts},
        phase = 'done',
        state = 'completed'
      WHERE id = ${item.id}
    `);

    if (item.yandex_cache_id) {
      const isCorrectInt = input.grade === 'again' ? 0 : 1;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO user_word_progress (user_id, word_id, status, touches_total, touches_correct, streak, added_to_vocab)
        VALUES (
          ${userId},
          ${item.yandex_cache_id},
          CASE WHEN ${isCorrectInt} >= ${TOUCH_GOAL} THEN 'known' ELSE 'learning' END,
          1,
          ${isCorrectInt},
          ${isCorrectInt},
          0
        )
        ON DUPLICATE KEY UPDATE
          touches_total = touches_total + 1,
          touches_correct = touches_correct + ${isCorrectInt},
          streak = CASE WHEN ${isCorrectInt} = 1 THEN streak + 1 ELSE 0 END,
          status = CASE
            WHEN status IN ('known', 'ignored') THEN status
            WHEN touches_correct + ${isCorrectInt} >= ${TOUCH_GOAL} THEN 'known'
            ELSE 'learning'
          END,
          updated_at = NOW(3)
      `);
    }

    if (shouldRetry) {
      const [maxOrderRow] = await tx.$queryRaw<Array<{ maxOrder: number | null }>>(Prisma.sql`
        SELECT MAX(queue_order) AS maxOrder
        FROM word_training_session_items
        WHERE session_id = ${sessionId}
      `);
      const retryOrder = Number(maxOrderRow?.maxOrder ?? 0) + 1;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO word_training_session_items (
          session_id,
          queue_order,
          word_key,
          word,
          translation,
          source_type,
          yandex_cache_id,
          reason,
          priority_score,
          initial_status,
          initial_stage,
          phase,
          state,
          attempt_count
        )
        VALUES (
          ${sessionId},
          ${retryOrder},
          ${item.word_key},
          ${item.word},
          ${item.translation},
          ${item.source_type},
          ${item.yandex_cache_id},
          'retry',
          ${item.priority_score + 5},
          ${srs.nextStatus},
          ${srs.nextStage},
          'recognition',
          'pending',
          ${nextAttempts}
        )
      `);
    }

    if (needsReinforcement) {
      const [maxOrderRow] = await tx.$queryRaw<Array<{ maxOrder: number | null }>>(Prisma.sql`
        SELECT MAX(queue_order) AS maxOrder
        FROM word_training_session_items
        WHERE session_id = ${sessionId}
      `);
      const baseOrder = Number(maxOrderRow?.maxOrder ?? 0);
      for (let round = 0; round < phraseRounds; round += 1) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO word_training_session_items (
            session_id,
            queue_order,
            word_key,
            word,
            translation,
            source_type,
            yandex_cache_id,
            reason,
            priority_score,
            initial_status,
            initial_stage,
            phase,
            state,
            attempt_count
          )
          VALUES (
            ${sessionId},
            ${baseOrder + round + 1},
            ${item.word_key},
            ${item.word},
            ${item.translation},
            ${item.source_type},
            ${item.yandex_cache_id},
            ${item.reason},
            ${item.priority_score + 1 + round},
            ${srs.nextStatus},
            ${srs.nextStage},
            'reinforcement',
            'pending',
            ${round}
          )
        `);
      }
    }
    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_sessions
      SET
        energy_left = GREATEST(0, energy_left - ${RECOGNITION_ENERGY_COST}),
        xp_earned = xp_earned + ${xpForGrade(input.grade)}
      WHERE id = ${sessionId}
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO word_training_events (session_id, user_id, word_key, event_type, payload)
      VALUES (
        ${sessionId},
        ${userId},
        ${item.word_key},
        'recognition',
        JSON_OBJECT(
          'grade', ${input.grade},
          'itemId', ${item.id},
          'nextStage', ${srs.nextStage},
          'nextStatus', ${srs.nextStatus}
        )
      )
    `);
  });

  const updated = await getSessionById(sessionId, userId);
  if (!updated) throw Object.assign(new Error('Session not found'), { status: 404 });
  const state = await buildSessionState(updated);

  if (input.grade === 'again' && state.task?.mode === 'recognition') {
    const alt = await getExamplesByWord(state.task.word, 1, state.task.context?.contentId ?? null);
    return { ...state, alternateExample: alt[0] ?? null };
  }
  return state;
};

const submitReinforcement = async (
  userId: string,
  sessionId: string,
  input: { itemId: number; exerciseType: ExerciseType; isCorrect: boolean },
) => {
  await ensureWordTrainingTables();
  const session = await getSessionById(sessionId, userId);
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
  if (session.status !== 'active') throw Object.assign(new Error('Session already finished'), { status: 400 });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const [item] = await tx.$queryRaw<SessionItemRow[]>(Prisma.sql`
      SELECT *
      FROM word_training_session_items
      WHERE id = ${input.itemId} AND session_id = ${sessionId}
      LIMIT 1
      FOR UPDATE
    `);
    if (!item) {
      throw Object.assign(new Error('Session item not found'), { status: 404 });
    }
    if (item.state !== 'pending' || item.phase !== 'reinforcement') {
      throw Object.assign(new Error('Current step is not reinforcement'), { status: 400 });
    }

    const [progress] = await tx.$queryRaw<ProgressRow[]>(Prisma.sql`
      SELECT *
      FROM word_training_progress
      WHERE user_id = ${userId} AND word_key = ${item.word_key}
      LIMIT 1
      FOR UPDATE
    `);
    if (!progress) {
      throw Object.assign(new Error('Word progress not found'), { status: 404 });
    }

    let nextStage = progress.srs_stage;
    let nextStatus = progress.status;
    let nextInterval = progress.interval_days;
    let nextDueAt = progress.due_at ?? addDays(now, 1);
    let wrongDelta = 0;
    let correctDelta = 0;

    if (input.isCorrect) {
      correctDelta = 1;
    } else {
      wrongDelta = 1;
      nextStage = Math.max(0, progress.srs_stage - 1);
      nextStatus = nextStage >= 2 ? 'review' : 'learning';
      nextInterval = Math.max(0, Math.floor(progress.interval_days / 2));
      nextDueAt = addMinutes(now, 60 * 6);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_progress
      SET
        status = ${nextStatus},
        srs_stage = ${nextStage},
        interval_days = ${nextInterval},
        due_at = ${nextDueAt},
        next_due_at = ${nextDueAt},
        correct_count = correct_count + ${correctDelta},
        wrong_count = wrong_count + ${wrongDelta}
      WHERE id = ${progress.id}
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_session_items
      SET
        reinforcement_type = ${input.exerciseType},
        reinforcement_correct = ${input.isCorrect ? 1 : 0},
        reinforcement_at = ${now},
        phase = 'done',
        state = 'completed'
      WHERE id = ${item.id}
    `);

    const [completedForWordRow] = await tx.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM word_training_session_items
      WHERE session_id = ${sessionId}
        AND word_key = ${item.word_key}
        AND state = 'completed'
        AND reinforcement_at IS NOT NULL
    `);
    const wordsCompletedDelta = Number(completedForWordRow?.total ?? 0) === 1 ? 1 : 0;

    if (item.yandex_cache_id) {
      const isCorrectInt = input.isCorrect ? 1 : 0;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO user_word_progress (user_id, word_id, status, touches_total, touches_correct, streak, added_to_vocab)
        VALUES (
          ${userId},
          ${item.yandex_cache_id},
          CASE WHEN ${isCorrectInt} >= ${TOUCH_GOAL} THEN 'known' ELSE 'learning' END,
          1,
          ${isCorrectInt},
          ${isCorrectInt},
          0
        )
        ON DUPLICATE KEY UPDATE
          touches_total = touches_total + 1,
          touches_correct = touches_correct + ${isCorrectInt},
          streak = CASE WHEN ${isCorrectInt} = 1 THEN streak + 1 ELSE 0 END,
          status = CASE
            WHEN status IN ('known', 'ignored') THEN status
            WHEN touches_correct + ${isCorrectInt} >= ${TOUCH_GOAL} THEN 'known'
            ELSE 'learning'
          END,
          updated_at = NOW(3)
      `);
    }

    if (!input.isCorrect && item.attempt_count < MAX_RETRY_ATTEMPTS) {
      const [maxOrderRow] = await tx.$queryRaw<Array<{ maxOrder: number | null }>>(Prisma.sql`
        SELECT MAX(queue_order) AS maxOrder
        FROM word_training_session_items
        WHERE session_id = ${sessionId}
      `);
      const retryOrder = Number(maxOrderRow?.maxOrder ?? 0) + 1;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO word_training_session_items (
          session_id,
          queue_order,
          word_key,
          word,
          translation,
          source_type,
          yandex_cache_id,
          reason,
          priority_score,
          initial_status,
          initial_stage,
          phase,
          state,
          attempt_count
        )
        VALUES (
          ${sessionId},
          ${retryOrder},
          ${item.word_key},
          ${item.word},
          ${item.translation},
          ${item.source_type},
          ${item.yandex_cache_id},
          'retry',
          ${item.priority_score + 5},
          ${nextStatus},
          ${nextStage},
          'recognition',
          'pending',
          ${item.attempt_count + 1}
        )
      `);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_sessions
      SET
        words_completed = words_completed + ${wordsCompletedDelta},
        energy_left = GREATEST(0, energy_left - ${REINFORCEMENT_ENERGY_COST}),
        xp_earned = xp_earned + ${input.isCorrect ? 2 : 0}
      WHERE id = ${sessionId}
    `);

    await tx.$executeRaw(Prisma.sql`
      INSERT INTO word_training_events (session_id, user_id, word_key, event_type, payload)
      VALUES (
        ${sessionId},
        ${userId},
        ${item.word_key},
        'reinforcement',
        JSON_OBJECT(
          'itemId', ${item.id},
          'exerciseType', ${input.exerciseType},
          'isCorrect', ${input.isCorrect ? 1 : 0}
        )
      )
    `);
  });

  const updated = await getSessionById(sessionId, userId);
  if (!updated) throw Object.assign(new Error('Session not found'), { status: 404 });
  return buildSessionState(updated);
};

const getCurrentTask = async (userId: string, sessionId: string) => {
  await ensureWordTrainingTables();
  const session = await getSessionById(sessionId, userId);
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });
  return buildSessionState(session);
};

const finishSession = async (userId: string, sessionId: string, force = false) => {
  await ensureWordTrainingTables();
  const session = await getSessionById(sessionId, userId);
  if (!session) throw Object.assign(new Error('Session not found'), { status: 404 });

  if (session.status !== 'active') {
    return buildSessionState(session);
  }

  if (!force) {
    const pending = await getSessionPendingCount(sessionId);
    if (pending > 0 && session.energy_left > 0) {
      throw Object.assign(new Error('Session has pending tasks. Use force=true to finish early.'), {
        status: 400,
      });
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE word_training_sessions
    SET energy_left = 0
    WHERE id = ${sessionId}
  `);

  const refreshed = await getSessionById(sessionId, userId);
  if (!refreshed) throw Object.assign(new Error('Session not found'), { status: 404 });
  return buildSessionState(refreshed);
};

const buildSnippetKey = (contentId: number, startSeconds: number, endSeconds: number): string =>
  `${contentId}:${startSeconds.toFixed(3)}:${endSeconds.toFixed(3)}`;

const listModerationWords = async (params: {
  limit?: number;
  offset?: number;
  filter?: SnippetModerationFilter;
  search?: string;
}) => {
  await ensureWordTrainingTables();
  const take = clamp(params.limit ?? 30, 1, 100);
  const skip = Math.max(0, params.offset ?? 0);
  const filter = params.filter ?? 'all';
  const search = (params.search ?? '').trim().toLowerCase();
  const searchSql = search ? Prisma.sql`AND LOWER(ydc.query) LIKE ${`%${search}%`}` : Prisma.empty;
  const moderationSql =
    filter === 'moderated'
      ? Prisma.sql`AND COALESCE(sel.selected_count, 0) > 0`
      : filter === 'unmoderated'
      ? Prisma.sql`AND COALESCE(sel.selected_count, 0) = 0`
      : Prisma.empty;

  const baseFrom = Prisma.sql`
    FROM yandex_dictionary_cache ydc
    LEFT JOIN (
      SELECT yandex_cache_id, COUNT(*) AS selected_count
      FROM word_training_preferred_snippets
      WHERE is_enabled = 1
      GROUP BY yandex_cache_id
    ) sel ON sel.yandex_cache_id = ydc.id
    WHERE ydc.lang = 'en'
    ${searchSql}
    ${moderationSql}
  `;

  const [countRow] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    ${baseFrom}
  `);

  const items = await prisma.$queryRaw<
    Array<{
      yandexCacheId: number;
      query: string;
      lang: string;
      selectedCount: number | null;
      updatedAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      ydc.id AS yandexCacheId,
      ydc.query AS query,
      ydc.lang AS lang,
      COALESCE(sel.selected_count, 0) AS selectedCount,
      ydc.updated_at AS updatedAt
    ${baseFrom}
    ORDER BY COALESCE(sel.selected_count, 0) DESC, ydc.updated_at DESC
    LIMIT ${take} OFFSET ${skip}
  `);

  return {
    items: items.map((item) => ({
      yandexCacheId: item.yandexCacheId,
      query: item.query,
      lang: item.lang,
      selectedCount: Number(item.selectedCount ?? 0),
      isModerated: Number(item.selectedCount ?? 0) > 0,
      updatedAt: item.updatedAt,
    })),
    total: Number(countRow?.total ?? 0),
    limit: take,
    offset: skip,
  };
};

const listGeneratedPhrases = async (params: {
  limit?: number;
  offset?: number;
  search?: string;
}) => {
  await ensureWordTrainingTables();
  const take = clamp(params.limit ?? 50, 1, 200);
  const skip = Math.max(0, params.offset ?? 0);
  const search = (params.search ?? '').trim().toLowerCase();
  const searchSql = search
    ? Prisma.sql`
      AND (
        LOWER(g.word) LIKE ${`%${search}%`}
        OR LOWER(g.phrase_en) LIKE ${`%${search}%`}
        OR LOWER(COALESCE(g.phrase_ru, '')) LIKE ${`%${search}%`}
      )
    `
    : Prisma.empty;

  const baseFrom = Prisma.sql`
    FROM word_training_generated_phrases g
    ${searchSql}
  `;

  const [countRow] = await prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    ${baseFrom}
  `);

  const items = await prisma.$queryRaw<
    Array<{
      id: bigint | number;
      yandexCacheId: bigint | number;
      word: string;
      phraseEn: string;
      phraseRu: string | null;
      phraseAudioUrl: string | null;
      phraseAudioVoice: string | null;
      sourceModel: string | null;
      updatedAt: Date;
    }>
  >(Prisma.sql`
    SELECT
      g.id AS id,
      g.yandex_cache_id AS yandexCacheId,
      g.word AS word,
      g.phrase_en AS phraseEn,
      g.phrase_ru AS phraseRu,
      g.phrase_audio_url AS phraseAudioUrl,
      g.phrase_audio_voice AS phraseAudioVoice,
      g.source_model AS sourceModel,
      g.updated_at AS updatedAt
    ${baseFrom}
    ORDER BY g.updated_at DESC, g.id DESC
    LIMIT ${take} OFFSET ${skip}
  `);

  return {
    items: items.map((item) => ({
      id: Number(item.id),
      yandexCacheId: Number(item.yandexCacheId),
      word: item.word,
      phraseEn: item.phraseEn,
      phraseRu: item.phraseRu,
      phraseAudioUrl: item.phraseAudioUrl,
      phraseAudioVoice: item.phraseAudioVoice,
      sourceModel: item.sourceModel,
      updatedAt: item.updatedAt,
    })),
    total: Number(countRow?.total ?? 0),
    limit: take,
    offset: skip,
  };
};

const getModerationSnippets = async (
  yandexCacheId: number,
  params: { limit?: number; paddingSeconds?: number },
) => {
  await ensureWordTrainingTables();
  const [wordRow] = await prisma.$queryRaw<Array<{ id: number; query: string; lang: string }>>(Prisma.sql`
    SELECT id, query, lang
    FROM yandex_dictionary_cache
    WHERE id = ${yandexCacheId}
    LIMIT 1
  `);
  if (!wordRow) {
    throw Object.assign(new Error('Word not found'), { status: 404 });
  }

  const selectedRows = await prisma.$queryRaw<
    Array<{ contentId: number; startSeconds: number; endSeconds: number }>
  >(Prisma.sql`
    SELECT content_id AS contentId, start_seconds AS startSeconds, end_seconds AS endSeconds
    FROM word_training_preferred_snippets
    WHERE yandex_cache_id = ${yandexCacheId} AND is_enabled = 1
  `);
  const selectedSet = new Set(
    selectedRows.map((row) =>
      buildSnippetKey(Number(row.contentId), Number(row.startSeconds), Number(row.endSeconds)),
    ),
  );

  const limit = clamp(params.limit ?? 20, 1, 60);
  const padding = clamp(params.paddingSeconds ?? 1, 0, 10);
  const result = await videoLearningService.searchPhrase(
    wordRow.query,
    limit,
    padding,
    undefined,
    Math.max(40, limit * 8),
    undefined,
  );

  return {
    word: {
      yandexCacheId: wordRow.id,
      query: wordRow.query,
      lang: wordRow.lang,
    },
    snippets: result.items.map((item) => {
      const contentId = Number(item.contentId);
      const startSeconds = Number(item.startSeconds);
      const endSeconds = Number(item.endSeconds);
      const key = buildSnippetKey(contentId, startSeconds, endSeconds);
      return {
        contentId,
        videoName: item.videoName,
        videoUrl: item.videoUrl,
        startSeconds,
        endSeconds,
        matchedText: item.matchedText,
        contextText: item.contextText,
        checked: selectedSet.has(key),
      };
    }),
  };
};

const saveModerationSelections = async (
  adminUserId: string,
  yandexCacheId: number,
  selected: PreferredSnippetInput[],
) => {
  await ensureWordTrainingTables();
  const [wordRow] = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
    SELECT id
    FROM yandex_dictionary_cache
    WHERE id = ${yandexCacheId}
    LIMIT 1
  `);
  if (!wordRow) {
    throw Object.assign(new Error('Word not found'), { status: 404 });
  }

  const normalized = selected
    .map((item) => ({
      contentId: Number(item.contentId),
      startSeconds: Number(item.startSeconds),
      endSeconds: Number(item.endSeconds),
      matchedText: item.matchedText?.trim() || null,
      contextText: item.contextText?.trim() || null,
    }))
    .filter(
      (item) =>
        Number.isFinite(item.contentId) &&
        Number.isFinite(item.startSeconds) &&
        Number.isFinite(item.endSeconds) &&
        item.contentId > 0 &&
        item.endSeconds > item.startSeconds,
    );

  const dedup = new Map<string, (typeof normalized)[number]>();
  normalized.forEach((item) => {
    dedup.set(buildSnippetKey(item.contentId, item.startSeconds, item.endSeconds), item);
  });

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM word_training_preferred_snippets
      WHERE yandex_cache_id = ${yandexCacheId}
    `);

    for (const item of dedup.values()) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO word_training_preferred_snippets (
          yandex_cache_id,
          content_id,
          start_seconds,
          end_seconds,
          matched_text,
          context_text,
          is_enabled,
          created_by_user_id,
          updated_by_user_id
        )
        VALUES (
          ${yandexCacheId},
          ${item.contentId},
          ${item.startSeconds},
          ${item.endSeconds},
          ${item.matchedText},
          ${item.contextText},
          1,
          ${adminUserId},
          ${adminUserId}
        )
      `);
    }
  });

  return { yandexCacheId, selectedCount: dedup.size };
};

const getWordMasteryMap = async (userId: string) => {
  await ensureWordTrainingTables();

  const cefrBlockColumnRows = await prisma.$queryRaw<Array<{ cnt: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*) AS cnt
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'yandex_dictionary_cache'
      AND column_name = 'cefr_block'
  `);
  const hasCefrBlockColumn = Number(cefrBlockColumnRows[0]?.cnt ?? 0) > 0;

  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      word: string;
      cefrLevel: string;
      cefrBlock: string | null;
      mastery: 'known' | 'learning' | 'new';
    }>
  >(
    hasCefrBlockColumn
      ? Prisma.sql`
    SELECT
      ydc.id AS id,
      ydc.query AS word,
      ydc.cefr_level AS cefrLevel,
      ydc.cefr_block AS cefrBlock,
      CASE
        WHEN uwp.status IN ('known', 'ignored') THEN 'known'
        WHEN uwp.status IN ('learning', 'viewed') THEN 'learning'
        ELSE 'new'
      END AS mastery
    FROM yandex_dictionary_cache ydc
    LEFT JOIN user_word_progress uwp
      ON uwp.word_id = ydc.id
      AND uwp.user_id = ${userId}
    WHERE LOWER(ydc.lang) REGEXP '^en([_-].+)?$'
      AND ydc.cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')
    ORDER BY FIELD(ydc.cefr_level, 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'),
             ydc.cefr_block ASC,
             ydc.query ASC,
             ydc.id ASC
  `
      : Prisma.sql`
    SELECT
      ydc.id AS id,
      ydc.query AS word,
      ydc.cefr_level AS cefrLevel,
      NULL AS cefrBlock,
      CASE
        WHEN uwp.status IN ('known', 'ignored') THEN 'known'
        WHEN uwp.status IN ('learning', 'viewed') THEN 'learning'
        ELSE 'new'
      END AS mastery
    FROM yandex_dictionary_cache ydc
    LEFT JOIN user_word_progress uwp
      ON uwp.word_id = ydc.id
      AND uwp.user_id = ${userId}
    WHERE LOWER(ydc.lang) REGEXP '^en([_-].+)?$'
      AND ydc.cefr_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')
    ORDER BY FIELD(ydc.cefr_level, 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'), ydc.query ASC, ydc.id ASC
  `,
  );

  const byStatus = {
    known: 0,
    learning: 0,
    new: 0,
  };
  const byLevel: Record<string, { total: number; known: number; learning: number; new: number }> = {};
  const byBlock: Record<string, { total: number; known: number; learning: number; new: number }> = {};

  for (const row of rows) {
    byStatus[row.mastery] += 1;
    if (!byLevel[row.cefrLevel]) {
      byLevel[row.cefrLevel] = { total: 0, known: 0, learning: 0, new: 0 };
    }
    byLevel[row.cefrLevel].total += 1;
    byLevel[row.cefrLevel][row.mastery] += 1;

    const blockKey = row.cefrBlock || `${row.cefrLevel}_0`;
    if (!byBlock[blockKey]) {
      byBlock[blockKey] = { total: 0, known: 0, learning: 0, new: 0 };
    }
    byBlock[blockKey].total += 1;
    byBlock[blockKey][row.mastery] += 1;
  }

  return {
    total: rows.length,
    byStatus,
    byLevel,
    byBlock,
    items: rows.map((row) => ({
      id: row.id,
      word: row.word,
      cefrLevel: row.cefrLevel,
      cefrBlock: row.cefrBlock,
      mastery: row.mastery,
    })),
  };
};

export const wordTrainingService = {
  loadOverview,
  startSession,
  getCurrentTask,
  submitRecognition,
  submitReinforcement,
  finishSession,
  getExamplesByWord: async (
    word: string,
    limit = 3,
    excludeContentId?: number | null,
    paddingSeconds = 2,
    paddingBeforeSeconds?: number,
    paddingAfterSeconds?: number,
  ) => {
    await ensureWordTrainingTables();
    return getExamplesByWord(
      word,
      limit,
      excludeContentId,
      paddingSeconds,
      paddingBeforeSeconds,
      paddingAfterSeconds,
    );
  },
  listModerationWords,
  listGeneratedPhrases,
  getModerationSnippets,
  saveModerationSelections,
  getWordMasteryMap,
};
