import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { prisma } from '../../shared/prisma/prismaClient';
import { buildYandexEntries, type YandexDictResponse } from '../mueller/mueller.service';

type SourceType = 'manual' | 'viewed' | 'exercise';
type QueueReason = 'review' | 'mistake' | 'new' | 'retry';
type SessionStatus = 'active' | 'completed' | 'interrupted';
type ProgressStatus = 'new' | 'learning' | 'review' | 'mastered';
type RecognitionGrade = 'again' | 'hard' | 'good' | 'easy';
type ExerciseType = 'fill-gap' | 'assemble';

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
};

type SessionRow = {
  id: string;
  user_id: string;
  status: SessionStatus;
  target_words: number;
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

const SESSION_TARGET_DEFAULT = 20;
const SESSION_TARGET_MIN = 10;
const SESSION_TARGET_MAX = 25;
const SESSION_ENERGY_START = 100;
const RECOGNITION_ENERGY_COST = 4;
const REINFORCEMENT_ENERGY_COST = 3;
const SOURCE_LIMIT = 500;
const MAX_RETRY_ATTEMPTS = 2;

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

const pickReinforcementType = (word: string): ExerciseType => {
  if (word.length > 8) return 'fill-gap';
  return Math.random() >= 0.5 ? 'fill-gap' : 'assemble';
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
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_word_training_session_item_order (session_id, queue_order),
      KEY idx_word_training_session_items_state (session_id, state, queue_order),
      KEY idx_word_training_session_items_word (session_id, word_key)
    )
  `);

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
      id,
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
      interval_days,
      due_at,
      last_reviewed_at,
      next_due_at,
      review_count,
      correct_count,
      wrong_count,
      forgotten_count,
      hard_count,
      good_count,
      easy_count,
      last_grade,
      created_at,
      updated_at
    FROM word_training_progress
    WHERE user_id = ${userId}
  `);

const buildDailyQueue = (rows: ProgressRow[], requestedTarget: number): {
  queue: QueueDraftItem[];
  reviewCount: number;
  mistakeCount: number;
  newCount: number;
} => {
  const now = Date.now();
  const target = clamp(requestedTarget, SESSION_TARGET_MIN, SESSION_TARGET_MAX);
  const newLimit = Math.min(7, Math.max(5, Math.floor(target * 0.28)));
  const reviewTarget = Math.max(8, target - newLimit);
  const mistakeTarget = Math.min(6, Math.max(3, Math.floor(target * 0.25)));

  const scored = rows.map((row) => {
    const dueTs = row.due_at?.getTime() ?? 0;
    const overdueHours = dueTs > 0 && dueTs <= now ? Math.floor((now - dueTs) / 3_600_000) : 0;
    const accuracy = row.review_count > 0 ? row.correct_count / row.review_count : 0;
    const mistakePressure = row.wrong_count * 3 + Math.round((1 - accuracy) * 10);
    return {
      row,
      overdueHours,
      mistakePressure,
    };
  });

  const reviewPool = scored
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

  const mistakePool = scored
    .filter(
      ({ row, mistakePressure }) =>
        (row.status === 'learning' || row.status === 'review') &&
        (row.wrong_count >= 2 || mistakePressure >= 6),
    )
    .sort((a, b) => {
      if (b.mistakePressure !== a.mistakePressure) return b.mistakePressure - a.mistakePressure;
      return b.row.source_weight - a.row.source_weight;
    });

  const newPool = scored
    .filter(({ row }) => row.status === 'new')
    .sort((a, b) => {
      if (b.row.source_weight !== a.row.source_weight) return b.row.source_weight - a.row.source_weight;
      return b.row.source_updated_at.getTime() - a.row.source_updated_at.getTime();
    });

  const selected = new Set<string>();
  const queue: QueueDraftItem[] = [];

  const pushFromPool = (pool: typeof reviewPool, reason: QueueReason, limit: number) => {
    for (const item of pool) {
      if (queue.length >= target) break;
      if (selected.has(item.row.word_key)) continue;
      if (limit <= 0) break;
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
      limit -= 1;
    }
  };

  pushFromPool(reviewPool, 'review', reviewTarget);
  pushFromPool(mistakePool, 'mistake', mistakeTarget);
  pushFromPool(newPool, 'new', newLimit);

  if (queue.length < target) {
    const fallback = scored.sort((a, b) => {
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
): Promise<WordExample[]> => {
  const normalizedWord = normalizeWord(word);
  if (!normalizedWord) return [];

  const gameRows = await prisma.$queryRaw<
    Array<{
      contentId: number;
      videoName: string;
      videoUrl: string | null;
      startSeconds: number | null;
      endSeconds: number | null;
      text: string;
    }>
  >(Prisma.sql`
    SELECT
      gs.content_id AS contentId,
      vlc.video_name AS videoName,
      vlc.video_url AS videoUrl,
      gs.start_seconds AS startSeconds,
      gs.end_seconds AS endSeconds,
      gs.phrase AS text
    FROM game_snippets gs
    INNER JOIN video_learning_content vlc ON vlc.id = gs.content_id
    WHERE LOWER(gs.phrase) LIKE ${`%${normalizedWord}%`}
      ${excludeContentId ? Prisma.sql`AND gs.content_id <> ${excludeContentId}` : Prisma.empty}
      AND gs.is_active = 1
      AND gs.is_approved = 1
    ORDER BY RAND()
    LIMIT ${Math.max(1, limit)}
  `);

  if (gameRows.length >= limit) {
    return gameRows.slice(0, limit);
  }

  const tokenRows = await prisma.$queryRaw<
    Array<{
      contentId: number;
      startSeconds: number | null;
      endSeconds: number | null;
      videoName: string;
      videoUrl: string | null;
      transcriptFull: string;
    }>
  >(Prisma.sql`
    SELECT
      t.content_id AS contentId,
      MIN(t.start_seconds) AS startSeconds,
      MAX(t.end_seconds) AS endSeconds,
      vlc.video_name AS videoName,
      vlc.video_url AS videoUrl,
      vlc.transcript_full AS transcriptFull
    FROM video_transcript_tokens t
    INNER JOIN video_learning_content vlc ON vlc.id = t.content_id
    WHERE t.token_normalized = ${normalizedWord}
      ${excludeContentId ? Prisma.sql`AND t.content_id <> ${excludeContentId}` : Prisma.empty}
    GROUP BY t.content_id, vlc.video_name, vlc.video_url, vlc.transcript_full
    ORDER BY RAND()
    LIMIT ${Math.max(1, limit * 2)}
  `);

  const merged: WordExample[] = [...gameRows];
  const seen = new Set<number>(gameRows.map((row) => row.contentId));
  for (const row of tokenRows) {
    if (merged.length >= limit) break;
    if (seen.has(row.contentId)) continue;
    seen.add(row.contentId);
    merged.push({
      contentId: row.contentId,
      videoName: row.videoName,
      videoUrl: row.videoUrl,
      startSeconds: row.startSeconds,
      endSeconds: row.endSeconds,
      text: row.transcriptFull.slice(0, 220),
    });
  }

  return merged.slice(0, limit);
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

const mapTask = async (sessionId: string, item: SessionItemRow) => {
  const position = await getQueuePosition(sessionId, item.id);
  let context = null as null | WordExample;

  if (item.context_content_id && item.context_text) {
    context = {
      contentId: item.context_content_id,
      videoName: '',
      videoUrl: null,
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
    return {
      mode: 'recognition' as const,
      itemId: item.id,
      wordKey: item.word_key,
      word: item.word,
      translation: item.translation,
      sourceType: item.source_type,
      reason: item.reason,
      attemptCount: item.attempt_count,
      queuePosition: position.position,
      queueTotal: position.total,
      context,
      showReinforcementAfter:
        item.initial_stage >= 2 ||
        item.initial_status === 'review' ||
        item.initial_status === 'mastered',
    };
  }

  const reinforcementType = item.reinforcement_type ?? pickReinforcementType(item.word);
  if (!item.reinforcement_type) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE word_training_session_items
      SET reinforcement_type = ${reinforcementType}
      WHERE id = ${item.id}
    `);
  }

  const assembleTokens = (context?.text ?? `${item.word} ${item.translation}`)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 10);

  return {
    mode: 'reinforcement' as const,
    itemId: item.id,
    wordKey: item.word_key,
    word: item.word,
    translation: item.translation,
    sourceType: item.source_type,
    reason: item.reason,
    queuePosition: position.position,
    queueTotal: position.total,
    context,
    reinforcement: {
      type: reinforcementType,
      sentence: context?.text ?? '',
      assembleTokens: assembleTokens.sort(() => Math.random() - 0.5),
      targetWord: item.word,
    },
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
      },
    };
  }

  const item = await getCurrentItem(fresh.id);
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
    task: item ? await mapTask(fresh.id, item) : null,
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
      SUM(CASE WHEN status IN ('learning', 'review') AND (due_at IS NULL OR due_at <= NOW(3)) THEN 1 ELSE 0 END) AS dueCount,
      SUM(CASE WHEN wrong_count > 0 THEN 1 ELSE 0 END) AS mistakeCount,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS newCount,
      SUM(CASE WHEN status = 'mastered' THEN 1 ELSE 0 END) AS masteredCount,
      COUNT(*) AS knownCount
    FROM word_training_progress
    WHERE user_id = ${userId}
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

const startSession = async (userId: string, targetWords?: number) => {
  await ensureWordTrainingTables();

  const existing = await getActiveSession(userId);
  if (existing) {
    return buildSessionState(existing);
  }

  await syncProgressFromSources(userId);
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
  const queueBuild = buildDailyQueue(progressRows, requestedTarget);
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
    const needsReinforcement =
      input.grade !== 'again' &&
      (item.initial_stage >= 2 || item.initial_status === 'review' || item.initial_status === 'mastered');

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
        phase = ${needsReinforcement ? 'reinforcement' : 'done'},
        state = ${needsReinforcement ? 'pending' : 'completed'}
      WHERE id = ${item.id}
    `);

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

    const itemCompleted = !needsReinforcement;
    const wordsCompletedDelta = itemCompleted ? 1 : 0;
    await tx.$executeRaw(Prisma.sql`
      UPDATE word_training_sessions
      SET
        energy_left = GREATEST(0, energy_left - ${RECOGNITION_ENERGY_COST}),
        words_completed = words_completed + ${wordsCompletedDelta},
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
        words_completed = words_completed + 1,
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

export const wordTrainingService = {
  loadOverview,
  startSession,
  getCurrentTask,
  submitRecognition,
  submitReinforcement,
  finishSession,
  getExamplesByWord: async (word: string, limit = 3) => {
    await ensureWordTrainingTables();
    return getExamplesByWord(word, limit);
  },
};
