import {
  Prisma,
  VideoLearningStatus,
  VideoTranscriptToken,
  VideoLearningContentCefrLevel,
  VideoLearningContentSpeechSpeed,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { LRUCache } from 'lru-cache';

import { prisma } from '../../shared/prisma/prismaClient';
import type {
  ProcessedVideo,
  AnalysisResult,
  Exercise,
  SubmitExerciseAnswer,
  TranscriptionResult,
  TranslationResult,
  VideoFeedItem,
  TranscriptWordChunk,
  PhraseSnippet,
  PhraseSearchResult,
  LikeStatus,
} from './videoLearning.types';
import type {
  UpdateCefrLevelInput,
  UpdateSpeechSpeedInput,
  UpdateGrammarComplexityInput,
  UpdateVocabularyComplexityInput,
  UpdateTopicsInput,
  UpdateTranscriptChunksInput,
  UpdateTranslationChunksInput,
  UpdateSubtitleChunkInput,
  UpdateExercisesInput,
  UpdateIsAdultContentInput,
  UpdateModerationStatusInput,
} from './videoLearning.schemas';

type ContentRecord = {
  id: number;
  videoName: string;
  videoUrl: string | null;
  cefrLevel: string;
  speechSpeed: string | null;
  grammarComplexity: string | null;
  vocabularyComplexity: string | null;
  topics: unknown;
  transcriptFull: string;
  transcriptChunks: unknown;
  transcript_word_chunks: unknown;
  transcriptTranslationFull: string | null;
  transcriptTranslationChunks: unknown;
  exercises: unknown;
  durationSeconds: number | null;
  audioLevel: number | null;
  processedAt: Date | null;
  status: string | null;
  likesCount: number | null;
  isAdultContent: boolean | null;
  isModerated: boolean;
  author: string | null;
};

type PoolRecord = Prisma.VideoLearningContentGetPayload<{
  include: { videoTopics: { select: { topic: true } } };
}>;

export const parseChunkArray = (value: unknown): TranscriptWordChunk[] => {
  if (!Array.isArray(value)) return [];

  return (value as unknown[]).map((chunk) => {
    if (!chunk || typeof chunk !== 'object') {
      return { text: '', timestamp: [0, 0] as [number, number] };
    }
    const candidate = chunk as Record<string, unknown>;
    const timestampValue = candidate.timestamp;
    const rawStart = Array.isArray(timestampValue) ? Number(timestampValue[0]) : Number(candidate.start);
    const rawEnd = Array.isArray(timestampValue) ? Number(timestampValue[1]) : Number(candidate.end);
    const start = Number.isFinite(rawStart) && rawStart >= 0 ? rawStart : 0;
    const end = Number.isFinite(rawEnd) && rawEnd >= start ? rawEnd : start;
    return {
      text: typeof candidate.text === 'string' ? candidate.text : '',
      timestamp: [start, end] as [number, number],
    };
  });
};

const normalizeToken = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\u2019/g, "'")
    .replace(/['’,]/g, '')
    .replace(/[^a-z0-9.]+/g, '');

const formatChunksText = (chunks: TranscriptWordChunk[]): string => {
  if (!chunks.length) return '';
  const joined = chunks.map((chunk) => chunk.text).join(' ').replace(/\s+([.,!?;:])/g, '$1');
  return joined.trim();
};

const buildContextText = (
  chunks: TranscriptWordChunk[],
  startIndex: number,
  endIndex: number,
  windowSize = 4,
): string => {
  if (!chunks.length) return '';
  const from = Math.max(0, startIndex - windowSize);
  const to = Math.min(chunks.length, endIndex + windowSize + 1);
  return formatChunksText(chunks.slice(from, to));
};

const findChunkIndexesInRange = (
  chunks: TranscriptWordChunk[],
  rangeStart: number,
  rangeEnd: number,
): number[] => {
  if (!chunks.length) return [];
  const safeStart = Math.max(0, rangeStart);
  const safeEnd = Math.max(safeStart, rangeEnd);
  const indexes: number[] = [];
  chunks.forEach((chunk, index) => {
    const [chunkStart, chunkEnd] = chunk.timestamp;
    if (!Number.isFinite(chunkStart) || !Number.isFinite(chunkEnd)) return;
    if (chunkEnd > safeStart && chunkStart < safeEnd) {
      indexes.push(index);
    }
  });
  return indexes;
};

const buildTextFromChunkIndexes = (
  chunks: TranscriptWordChunk[],
  indexes: number[],
): string => {
  if (!indexes.length) return '';
  const selected = indexes
    .map((idx) => chunks[idx])
    .filter((chunk): chunk is TranscriptWordChunk => Boolean(chunk) && typeof chunk.text === 'string');
  if (!selected.length) return '';
  return formatChunksText(selected);
};

const ensureContentNumericId = (value: string | number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw Object.assign(new Error('Invalid content identifier'), { status: 400 });
  }
  return numeric;
};

type SanitizedTranscriptChunk = {
  text: string;
  timestamp: [number, number];
};

const sanitizeTranscriptChunksForStorage = (chunks: UpdateTranscriptChunksInput['chunks']): SanitizedTranscriptChunk[] =>
  chunks.map((chunk) => ({
    text: chunk.text.trim(),
    timestamp: [Number(chunk.timestamp[0]), Number(chunk.timestamp[1])] as [number, number],
  }));

const sanitizeTranslationChunksForStorage = (chunks: UpdateTranslationChunksInput['chunks']): SanitizedTranscriptChunk[] =>
  chunks.map((chunk) => ({
    text: chunk.text.trim(),
    timestamp: [Number(chunk.timestamp[0]), Number(chunk.timestamp[1])] as [number, number],
  }));

const sanitizeStoredChunks = (value: unknown): SanitizedTranscriptChunk[] =>
  parseChunkArray(value).map((chunk) => ({
    text: chunk.text.trim(),
    timestamp: [Number(chunk.timestamp[0]), Number(chunk.timestamp[1])] as [number, number],
  }));

const buildFullTextFromChunks = (chunks: SanitizedTranscriptChunk[]): string => {
  const combined = chunks
    .map((chunk) => chunk.text.trim())
    .filter((text) => text.length > 0)
    .join(' ');
  if (!combined.length) return '';
  return combined.replace(/\s+([.,!?;:])/g, '$1').trim();
};

const normalizeTopicsForStorage = (topics: UpdateTopicsInput['topics']): string[] => {
  const unique = new Map<string, string>();
  topics.forEach((topic) => {
    const trimmed = topic.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!unique.has(key)) {
      unique.set(key, trimmed);
    }
  });
  return Array.from(unique.values()).slice(0, 20);
};

const normalizeExercisesForStorage = (input: UpdateExercisesInput['exercises']): Prisma.JsonArray => {
  const normalized = input.map((exercise) => {
    const id = (exercise.id ?? '').trim() || `exercise-${randomUUID()}`;
    const options = exercise.options.map((option) => option.trim());
    const boundedCorrect = Math.min(Math.max(exercise.correctAnswer, 0), options.length - 1);
    const base = {
      id,
      type: exercise.type,
      question: exercise.question.trim(),
      options,
      correctAnswer: boundedCorrect,
    };
    if (exercise.type === 'vocabulary') {
      return {
        ...base,
        word: (exercise.word ?? '').trim(),
      };
    }
    return base;
  });
  return normalized as unknown as Prisma.JsonArray;
};

const fetchModerationFlags = async (
  ids: number[],
): Promise<Map<number, { isAdultContent: boolean; isModerated: boolean }>> => {
  if (!ids.length) return new Map();
  const rows = await prisma.$queryRaw<Array<{ id: number; isAdultContent: number | boolean | null; isModerated: number | boolean | null }>>`
    SELECT id, is_adult_content AS isAdultContent, is_moderated AS isModerated
    FROM video_learning_content
    WHERE id IN (${Prisma.join(ids)})
  `;

  const map = new Map<number, { isAdultContent: boolean; isModerated: boolean }>();
  rows.forEach((row) => {
    const adultValue =
      typeof row.isAdultContent === 'number'
        ? row.isAdultContent
        : row.isAdultContent === true
        ? 1
        : Number(row.isAdultContent ?? 0);
    const moderatedValue =
      typeof row.isModerated === 'number'
        ? row.isModerated
        : row.isModerated === true
        ? 1
        : Number(row.isModerated ?? 0);
    map.set(row.id, {
      isAdultContent: adultValue === 1,
      isModerated: moderatedValue === 1,
    });
  });
  return map;
};

const fetchModerationFlag = async (
  id: number,
): Promise<{ isAdultContent: boolean; isModerated: boolean }> => {
  const map = await fetchModerationFlags([id]);
  return map.get(id) ?? { isAdultContent: false, isModerated: false };
};

type PhraseMatch = {
  startIndex: number;
  endIndex: number;
};

const DEFAULT_SNIPPET_LIMIT = 10;
const MAX_SNIPPET_LIMIT = 50;
const DEFAULT_SNIPPET_CAP = 30;
const MAX_SNIPPET_CAP = 200;
const CONTEXT_WINDOW = 4;
const DEFAULT_PADDING_SECONDS = 1;
const MAX_PADDING_SECONDS = 10;
const TOKEN_CONTEXT_WINDOW = 6;
const TOKEN_INSERT_BATCH_SIZE = 250;
const TOKEN_TEXT_LIMIT = 120;
const TOKEN_CANDIDATE_BATCH_SIZE = 200;
const MAX_TOKEN_CANDIDATE_BATCHES = 200;
const FULLTEXT_CANDIDATE_LIMIT = 500;
const RANDOM_PRIORITY_JITTER = 12;
const UNWATCHED_POOL_MULTIPLIER = 6;
const WATCHED_POOL_MULTIPLIER = 3;
const TRANSCRIPT_BACKFILL_BATCH_SIZE = 200;
const RECORD_FETCH_MULTIPLIER = 1.5;
const MAX_CURSOR_IDS = 500; // Limit for pagination cursor to prevent memory/performance issues
const MAX_USER_HISTORY = 2000; // Limit for user likes/progress to load

// LRU Cache for performance optimization
// Significantly reduces DB load for frequently accessed user data
const lruCache = new LRUCache<string, any>({
  max: 1000, // Max 1000 cache entries (supports ~1000 users)
  maxSize: 50_000_000, // Max 50 MB total cache size
  sizeCalculation: (value) => JSON.stringify(value).length,
  ttl: 1000 * 60 * 5, // Default TTL: 5 minutes
});

const findPhraseMatches = (
  wordChunks: TranscriptWordChunk[],
  normalizedTokens: string[],
): PhraseMatch[] => {
  if (!wordChunks.length || !normalizedTokens.length) return [];

  const searchable = wordChunks
    .map((chunk, index) => ({
      index,
      normalized: normalizeToken(chunk.text),
    }))
    .filter((item) => item.normalized.length > 0);

  if (!searchable.length) return [];

  const matches: PhraseMatch[] = [];
  const phraseLength = normalizedTokens.length;

  for (let i = 0; i <= searchable.length - phraseLength; i += 1) {
    let isMatch = true;
    for (let j = 0; j < phraseLength; j += 1) {
      const candidate = searchable[i + j];
      if (!candidate || candidate.normalized !== normalizedTokens[j]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      const startIndex = searchable[i].index;
      const endIndex = searchable[i + phraseLength - 1].index;
      matches.push({ startIndex, endIndex });
      i += phraseLength - 1;
    }
  }

  return matches;
};

const sanitizeSnippetLimit = (limit?: number): number => {
  if (!Number.isFinite(limit ?? Number.NaN)) return DEFAULT_SNIPPET_LIMIT;
  const coerced = Math.trunc(limit as number);
  if (Number.isNaN(coerced) || coerced <= 0) return DEFAULT_SNIPPET_LIMIT;
  return Math.min(coerced, MAX_SNIPPET_LIMIT);
};

const sanitizePaddingSeconds = (padding?: number): number => {
  if (!Number.isFinite(padding ?? Number.NaN)) return DEFAULT_PADDING_SECONDS;
  const coerced = Math.trunc(padding as number);
  if (Number.isNaN(coerced) || coerced < 0) return DEFAULT_PADDING_SECONDS;
  return Math.min(coerced, MAX_PADDING_SECONDS);
};

const sanitizeSnippetCap = (cap?: number, fallback = DEFAULT_SNIPPET_CAP): number => {
  if (!Number.isFinite(cap ?? Number.NaN)) return fallback;
  const coerced = Math.trunc(cap as number);
  if (Number.isNaN(coerced) || coerced <= 0) return fallback;
  return Math.min(coerced, MAX_SNIPPET_CAP);
};

const paginateSnippets = (
  phrase: string,
  snippets: PhraseSnippet[],
  pageSize: number,
  cursorOffset: number,
  snippetCap: number,
): PhraseSearchResult => {
  const total = Math.min(snippets.length, snippetCap);
  const start = Math.min(cursorOffset, total);
  const pageItems = snippets.slice(start, start + pageSize);
  const returned = pageItems.length;
  const nextOffset = start + returned;
  const hasMore = nextOffset < total;
  const nextCursor = hasMore ? String(nextOffset) : null;

  return {
    phrase,
    items: pageItems,
    returned,
    total,
    hasMore,
    nextCursor,
    pageSize,
  };
};

const sanitizeCursorOffset = (offset?: number): number => {
  if (!Number.isFinite(offset ?? Number.NaN)) return 0;
  const coerced = Math.trunc(offset as number);
  if (Number.isNaN(coerced) || coerced < 0) return 0;
  return coerced;
};

const adjustTopicPreferences = async (
  tx: Prisma.TransactionClient,
  userId: string,
  contentId: number,
  delta: number,
) => {
  const topics = await tx.videoTopic.findMany({
    where: { contentId },
    select: { topic: true },
  });

  if (!topics.length) return;

  await Promise.all(
    topics.map(async ({ topic }) => {
      if (delta > 0) {
        await tx.videoTopicPreference.upsert({
          where: { userId_topic: { userId, topic } },
          update: { likes: { increment: delta } },
          create: { userId, topic, likes: delta },
        });
      } else {
        const existing = await tx.videoTopicPreference.findUnique({
          where: { userId_topic: { userId, topic } },
        });
        if (!existing) return;
        if (existing.likes + delta <= 0) {
          await tx.videoTopicPreference.delete({
            where: { userId_topic: { userId, topic } },
          });
        } else {
          await tx.videoTopicPreference.update({
            where: { userId_topic: { userId, topic } },
            data: { likes: existing.likes + delta },
          });
        }
      }
    }),
  );
};

const normalizeExercises = (raw: unknown): Exercise[] => {
  if (!Array.isArray(raw)) return [];

  return raw.map((item, index) => {
    const fallbackId = `exercise-${index + 1}-${randomUUID()}`;
    const fallbackOptions: string[] = [];
    const fallbackCorrect = 0;
    const fallbackQuestion = '';

    if (item && typeof item === 'object') {
      const typed = item as Partial<Record<string, unknown>>;
      const id =
        typeof typed.id === 'string' && typed.id.trim().length > 0 ? typed.id : fallbackId;
      const options = Array.isArray(typed.options) ? typed.options.map(String) : fallbackOptions;
      const correct =
        typeof typed.correctAnswer === 'number' && Number.isInteger(typed.correctAnswer)
          ? typed.correctAnswer
          : fallbackCorrect;
      const question =
        typeof typed.question === 'string' ? typed.question : fallbackQuestion;
      const normalizedCorrect =
        options.length > 0 ? Math.max(0, Math.min(options.length - 1, correct)) : 0;
      const type = (typed.type as Exercise['type']) ?? 'vocabulary';

      if (type === 'vocabulary') {
        const word = typeof typed.word === 'string' ? typed.word : '';
        return {
          id,
          type: 'vocabulary',
          question,
          options,
          correctAnswer: normalizedCorrect,
          word,
        };
      }

      if (type === 'topic') {
        return {
          id,
          type: 'topic',
          question,
          options,
          correctAnswer: normalizedCorrect,
        };
      }

      return {
        id,
        type: 'statementCheck',
        question,
        options,
        correctAnswer: normalizedCorrect,
      };
    }

    return {
      id: fallbackId,
      type: 'vocabulary',
      question: fallbackQuestion,
      options: fallbackOptions,
      correctAnswer: fallbackCorrect,
      word: '',
    };
  });
};

const mapTopics = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).slice(0, 3);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).slice(0, 3);
    } catch {
      return [value];
    }
  }
  return [];
};

const mapTranscription = (
  fullText: string,
  chunksValue: unknown,
  wordChunksValue: unknown,
): TranscriptionResult => {
  const chunks = parseChunkArray(chunksValue);
  const wordChunks = parseChunkArray(wordChunksValue);

  return {
    fullText: fullText ?? '',
    text: fullText ?? '',
    chunks,
    wordChunks: wordChunks.length ? wordChunks : chunks,
  };
};

const mapTranslation = (fullText: string | null, chunksValue: unknown): TranslationResult => ({
  ...mapTranscription(fullText ?? '', chunksValue, []),
  wordChunks: [],
});

const mapContentRecord = (
  record: ContentRecord,
  isLiked = false,
  flags?: { isAdultContent?: boolean; isModerated?: boolean },
): ProcessedVideo => {
  const transcription = mapTranscription(
    record.transcriptFull ?? '',
    record.transcriptChunks,
    record.transcript_word_chunks,
  );
  const translation = mapTranslation(record.transcriptTranslationFull, record.transcriptTranslationChunks);
  const analysis: AnalysisResult = {
    cefrLevel: (record.cefrLevel as AnalysisResult['cefrLevel']) ?? 'A1',
    speechSpeed: (record.speechSpeed as AnalysisResult['speechSpeed']) ?? 'normal',
    grammarComplexity: (record.grammarComplexity as AnalysisResult['grammarComplexity']) ?? 'simple',
    vocabularyComplexity: (record.vocabularyComplexity as AnalysisResult['vocabularyComplexity']) ?? 'basic',
    topics: mapTopics(record.topics),
  };
  const exercises = normalizeExercises(record.exercises);

  return {
    id: record.id.toString(),
    videoName: record.videoName,
    videoUrl: typeof record.videoUrl === 'string' ? record.videoUrl : '',
    durationSeconds: record.durationSeconds,
    audioLevel: record.audioLevel ?? undefined,
    transcription,
    translation,
    analysis,
    exercises,
    likesCount: record.likesCount ?? 0,
    isLiked,
    isAdultContent:
      flags?.isAdultContent ??
      (typeof record.isAdultContent === 'boolean'
        ? record.isAdultContent
        : Boolean(record.isAdultContent)),
    isModerated:
      flags?.isModerated ??
      (typeof record.isModerated === 'boolean'
        ? record.isModerated
        : Boolean(record.isModerated)),
    author: record.author ?? null,
    createdAt: (record.processedAt ?? new Date()).toISOString(),
    updatedAt: (record.processedAt ?? new Date()).toISOString(),
  };
};

type ModerationFilter = 'all' | 'moderated' | 'unmoderated';

// Cache helper functions for performance optimization
const getCachedTopicPreferences = async (userId: string): Promise<Array<{ topic: string; likes: number }>> => {
  const cacheKey = `topics:${userId}`;
  const cached = lruCache.get(cacheKey) as Array<{ topic: string; likes: number }> | undefined;

  if (cached) return cached;

  const data = await prisma.videoTopicPreference.findMany({
    where: { userId },
    select: { topic: true, likes: true },
    orderBy: { likes: 'desc' },
    take: 100,
  });

  lruCache.set(cacheKey, data, { ttl: 1000 * 60 * 5 }); // 5 min TTL
  return data;
};

const getCachedLikes = async (userId: string): Promise<Array<{ contentId: number }>> => {
  const cacheKey = `likes:${userId}`;
  const cached = lruCache.get(cacheKey) as Array<{ contentId: number }> | undefined;

  if (cached) return cached;

  const data = await prisma.videoLike.findMany({
    where: { userId },
    select: { contentId: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_USER_HISTORY,
  });

  lruCache.set(cacheKey, data, { ttl: 1000 * 60 * 2 }); // 2 min TTL (changes more often)
  return data;
};

const getCachedProgress = async (userId: string): Promise<Array<{ contentId: number; status: VideoLearningStatus }>> => {
  const cacheKey = `progress:${userId}`;
  const cached = lruCache.get(cacheKey) as Array<{ contentId: number; status: VideoLearningStatus }> | undefined;

  if (cached) return cached;

  const data = await prisma.videoLearningProgress.findMany({
    where: { userId },
    select: { contentId: true, status: true },
    orderBy: { updatedAt: 'desc' },
    take: MAX_USER_HISTORY,
  });

  lruCache.set(cacheKey, data, { ttl: 1000 * 60 * 1 }); // 1 min TTL (changes frequently)
  return data;
};

// Invalidate user cache (call after likes/progress updates)
const invalidateUserCache = (userId: string) => {
  lruCache.delete(`topics:${userId}`);
  lruCache.delete(`likes:${userId}`);
  lruCache.delete(`progress:${userId}`);
};

const computeRecommendationScores = async (
  userId: string,
  excludeIds: Set<number>,
  cefrLevels?: string,
  speechSpeeds?: string,
  showAdultContent: boolean | undefined = true,
  moderationFilter: ModerationFilter | undefined = 'moderated',
  isAdmin: boolean = false,
  requestLimit: number = 10, // Add limit parameter
) => {
  // Fetch user data in parallel WITH CACHE
  // OPTIMIZATION: LRU cache reduces DB load by 60-80% for frequent requests
  const [likedRecords, topicPreferences, progressRecords] = await Promise.all([
    getCachedLikes(userId),
    getCachedTopicPreferences(userId),
    getCachedProgress(userId),
  ]);

  const likedSet = new Set(likedRecords.map((item) => item.contentId));
  const watchedSet = new Set(progressRecords.map((p) => p.contentId));
  const statusMap = new Map(progressRecords.map((p) => [p.contentId, p.status]));

  // Parse filters
  const allowedLevels = cefrLevels
    ? cefrLevels.split(',').map(level => level.trim().toUpperCase())
    : null;
  const allowedSpeeds = speechSpeeds
    ? speechSpeeds.split(',').map(speed => speed.trim().toLowerCase())
    : null;

  // Build optimized where clause with filters
  const baseWhere: Prisma.VideoLearningContentWhereInput = {};

  if (allowedLevels && allowedLevels.length > 0) {
    baseWhere.cefrLevel = { in: allowedLevels as VideoLearningContentCefrLevel[] };
  }

  if (allowedSpeeds && allowedSpeeds.length > 0) {
    baseWhere.speechSpeed = { in: allowedSpeeds as VideoLearningContentSpeechSpeed[] };
  }

  if (showAdultContent === false) {
    baseWhere.isAdultContent = false;
  }

  // Handle moderation filter
  const effectiveModerationFilter = isAdmin ? (moderationFilter ?? 'all') : 'moderated';
  if (effectiveModerationFilter === 'moderated') {
    baseWhere.isModerated = true;
  } else if (effectiveModerationFilter === 'unmoderated') {
    baseWhere.isModerated = false;
  }

  const buildNotInFilter = (...sets: Set<number>[]) => {
    const combined = new Set<number>();
    sets.forEach((set) => set.forEach((value) => combined.add(value)));
    return combined.size > 0 ? Array.from(combined) : null;
  };

  const fetchRandomizedPool = async (
    where: Prisma.VideoLearningContentWhereInput,
    poolMultiplier: number,
  ) => {
    // OPTIMIZATION: For large datasets, avoid skip + orderBy which causes "Out of sort memory"
    // Instead, use ID range filtering which is much faster with indexes

    // Get min/max IDs matching the filter (uses index, very fast)
    const cefrLevels = where.cefrLevel && typeof where.cefrLevel === 'object' && 'in' in where.cefrLevel
      ? where.cefrLevel.in as string[]
      : null;
    const speechSpeeds = where.speechSpeed && typeof where.speechSpeed === 'object' && 'in' in where.speechSpeed
      ? where.speechSpeed.in as string[]
      : null;
    const excludeIds = where.id && typeof where.id === 'object' && 'notIn' in where.id
      ? where.id.notIn as number[]
      : null;

    // CACHE min/max query - rarely changes (only when new videos added)
    const cacheKey = `minmax:${where.isModerated}:${where.isAdultContent}:${cefrLevels?.join(',')}:${speechSpeeds?.join(',')}`;
    let minMaxResult = lruCache.get(cacheKey);

    if (!minMaxResult) {
      const [result] = await prisma.$queryRaw<Array<{ minId: number; maxId: number; total: bigint }>>`
        SELECT MIN(id) as minId, MAX(id) as maxId, COUNT(*) as total
        FROM video_learning_content
        WHERE ${where.isModerated !== undefined ? Prisma.sql`is_moderated = ${where.isModerated}` : Prisma.sql`1=1`}
          ${where.isAdultContent !== undefined ? Prisma.sql`AND is_adult_content = ${where.isAdultContent}` : Prisma.sql``}
          ${cefrLevels ? Prisma.sql`AND cefr_level IN (${Prisma.join(cefrLevels)})` : Prisma.sql``}
          ${speechSpeeds ? Prisma.sql`AND speech_speed IN (${Prisma.join(speechSpeeds)})` : Prisma.sql``}
      `;
      minMaxResult = result;
      lruCache.set(cacheKey, minMaxResult, { ttl: 1000 * 60 * 30 }); // 30 min TTL (rarely changes)
    }

    if (!minMaxResult || minMaxResult.total === 0n) return [];

    const total = Number(minMaxResult.total);
    const minId = minMaxResult.minId;
    const maxId = minMaxResult.maxId;

    // Adaptive pool size: smaller for large datasets
    const adaptiveMultiplier = total > 1000 ? Math.min(poolMultiplier, 3) : poolMultiplier;
    const desired = Math.max(requestLimit * adaptiveMultiplier, requestLimit);
    const takeLimit = Math.min(desired, total);

    // Stage 1: Get random IDs using ID range (NO skip, NO orderBy on full table)
    const selectedIds = new Set<number>();
    const chunkSize = Math.max(Math.ceil(requestLimit / 2), 5);
    const maxAttempts = Math.min(8, Math.ceil(takeLimit / chunkSize) * 2);

    for (let attempt = 0; attempt < maxAttempts && selectedIds.size < takeLimit; attempt += 1) {
      // Generate random ID in range instead of using skip
      const randomId = Math.floor(Math.random() * (maxId - minId + 1)) + minId;

      // Build where clause, preserving original filters but adding id range
      const rangeWhere: Prisma.VideoLearningContentWhereInput = {
        ...where,
        id: where.id && typeof where.id === 'object' && 'notIn' in where.id
          ? { gte: randomId, notIn: where.id.notIn as number[] }
          : { gte: randomId },
      };

      const idChunk = await prisma.videoLearningContent.findMany({
        where: rangeWhere,
        select: { id: true },
        take: Math.min(chunkSize, takeLimit - selectedIds.size),
        orderBy: { id: 'asc' }, // Only sort the small chunk we're taking
      });

      idChunk.forEach((record) => selectedIds.add(record.id));
    }

    // Fallback: if still not enough, get first N records (fast with index)
    if (selectedIds.size < takeLimit) {
      const fallbackIds = await prisma.videoLearningContent.findMany({
        where,
        select: { id: true },
        take: takeLimit - selectedIds.size,
        orderBy: { id: 'asc' },
      });
      fallbackIds.forEach((record) => selectedIds.add(record.id));
    }

    if (selectedIds.size === 0) return [];

    // Stage 2: Load full data with JOIN only for selected IDs
    const records = await prisma.videoLearningContent.findMany({
      where: {
        id: { in: Array.from(selectedIds) },
      },
      include: {
        videoTopics: { select: { topic: true } },
      },
    });

    return records.slice(0, takeLimit);
  };

  // Fetch unwatched videos first (prioritize fresh content)
  // CRITICAL FIX: Avoid NOT IN with huge lists (can cause MySQL to fail or be very slow)
  // Instead, we filter in-memory after fetching, which is faster for large exclude sets
  const combinedExcludeSet = new Set([...excludeIds, ...watchedSet]);

  // Only use NOT IN if exclude list is small (< 100 IDs), otherwise filter in app
  const useNotInFilter = combinedExcludeSet.size < 100;
  const unwatchedWhere: Prisma.VideoLearningContentWhereInput = {
    ...baseWhere,
    ...(useNotInFilter && combinedExcludeSet.size > 0
      ? { id: { notIn: Array.from(combinedExcludeSet) } }
      : {}
    ),
  };

  let unwatchedVideos = await fetchRandomizedPool(unwatchedWhere, UNWATCHED_POOL_MULTIPLIER);

  // Filter in-memory if we didn't use NOT IN (for large exclude sets)
  if (!useNotInFilter && combinedExcludeSet.size > 0) {
    unwatchedVideos = unwatchedVideos.filter(video => !combinedExcludeSet.has(video.id));
  }

  // Fetch watched videos as fallback (if user watched everything)
  let watchedVideos: typeof unwatchedVideos = [];
  if (unwatchedVideos.length < requestLimit && watchedSet.size > 0) {
    const watchedIds = Array.from(watchedSet).filter((id) => !excludeIds.has(id));
    if (watchedIds.length > 0) {
      watchedVideos = await fetchRandomizedPool(
        {
          ...baseWhere,
          id: { in: watchedIds },
        },
        WATCHED_POOL_MULTIPLIER,
      );
    }
  }

  // Shuffle arrays for randomization (Fisher-Yates algorithm)
  const shuffleArray = <T>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Randomize unwatched and watched videos
  const randomizedUnwatched = shuffleArray(unwatchedVideos);
  const randomizedWatched = shuffleArray(watchedVideos);

  // Score and sort on DB-filtered subset (much smaller)
  const topicScoreMap = new Map(topicPreferences.map((item) => [item.topic, item.likes]));

  const scoreVideo = (record: any, isWatched: boolean) => {
    const topics = record.videoTopics.map((t: any) => t.topic);
    const topicScore = topics.reduce((sum: number, topic: string) =>
      sum + (topicScoreMap.get(topic) ?? 0), 0);
    const popularityScore = Math.log10((record.likesCount ?? 0) + 1);
    const likedBoost = likedSet.has(record.id) ? 30 : 0;
    const watchedPenalty = isWatched ? 25 : 0;

    const baseScore = topicScore * 12 + popularityScore * 5 + likedBoost - watchedPenalty;
    const randomJitter = Math.random() * RANDOM_PRIORITY_JITTER;
    return baseScore + randomJitter;
  };

  // Use randomized arrays instead of original
  const unwatched = randomizedUnwatched.map(record => ({
    record,
    score: scoreVideo(record, false),
    isWatched: false,
    moderation: {
      isAdultContent: record.isAdultContent ?? false,
      isModerated: record.isModerated ?? false,
    },
  }));

  const watched = randomizedWatched.map(record => ({
    record,
    score: scoreVideo(record, true),
    isWatched: true,
    moderation: {
      isAdultContent: record.isAdultContent ?? false,
      isModerated: record.isModerated ?? false,
    },
  }));

  // Sort by score (personalization layer on top of randomization)
  unwatched.sort((a, b) => b.score - a.score);
  watched.sort((a, b) => b.score - a.score);

  return { likedSet, statusMap, unwatched, watched };
};

const getFeed = async (
  userId: string,
  limit?: number,
  cursor?: string | null,
  cefrLevels?: string,
  speechSpeeds?: string,
  showAdultContent: boolean | undefined = true,
  moderationFilter: ModerationFilter | undefined = 'moderated',
  isAdmin: boolean = false,
): Promise<{ items: VideoFeedItem[]; nextCursor: string | null; hasMore: boolean }> => {
  const normalizedLimit = limit && limit > 0 ? limit : 1;

  // PROTECTION: Limit cursor size to prevent memory/performance issues
  // For infinite scroll, we don't need to track ALL seen videos forever

  const excludeIds = new Set<number>();
  if (cursor) {
    const parsedIds = cursor
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);

    // Only keep the most recent IDs if cursor is too large
    const idsToUse = parsedIds.length > MAX_CURSOR_IDS
      ? parsedIds.slice(-MAX_CURSOR_IDS) // Keep last N IDs
      : parsedIds;

    idsToUse.forEach((value) => excludeIds.add(value));
  }

  const { likedSet, statusMap, unwatched, watched } = await computeRecommendationScores(
    userId,
    excludeIds,
    cefrLevels,
    speechSpeeds,
    showAdultContent,
    moderationFilter,
    isAdmin,
    normalizedLimit, // Pass limit to optimize database query
  );

  const combined = [...unwatched, ...watched];
  if (!combined.length) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const selected = combined.slice(0, normalizedLimit);
  const hasMore = combined.length > normalizedLimit;

  const items: VideoFeedItem[] = selected.map(({ record, moderation }) => {
    const { videoTopics: _topics, ...rest } = record;
    const processed = mapContentRecord(rest as ContentRecord, likedSet.has(record.id), moderation);
    return {
      id: processed.id,
      videoName: processed.videoName,
      videoUrl: processed.videoUrl,
      durationSeconds: processed.durationSeconds,
      audioLevel: processed.audioLevel,
      analysis: processed.analysis,
      status: statusMap.get(record.id) ?? VideoLearningStatus.NOT_STARTED,
      likesCount: processed.likesCount,
      isLiked: processed.isLiked,
      createdAt: processed.createdAt,
      isAdultContent: processed.isAdultContent,
      isModerated: processed.isModerated,
      author: processed.author ?? null,
    };
  });

  // Build next cursor with size limit protection
  const nextCursorSet = new Set<number>(excludeIds);
  for (const item of selected) {
    nextCursorSet.add(item.record.id);
  }

  // PROTECTION: Limit cursor size to prevent it from growing infinitely
  const nextCursorIds = Array.from(nextCursorSet);
  const limitedCursorIds = nextCursorIds.length > MAX_CURSOR_IDS
    ? nextCursorIds.slice(-MAX_CURSOR_IDS) // Keep last N IDs
    : nextCursorIds;

  const nextCursor =
    hasMore && limitedCursorIds.length > 0
      ? limitedCursorIds.sort((a, b) => a - b).join(',')
      : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
};

const searchPhraseLegacy = async (
  phrase: string,
  limit?: number,
  paddingSeconds?: number,
  cursor?: number,
  maxSnippets?: number,
): Promise<PhraseSearchResult> => {
  const trimmed = (phrase ?? '').trim();
  const pageSize = sanitizeSnippetLimit(limit);
  if (!trimmed) {
    return { phrase: '', items: [], returned: 0, total: 0, hasMore: false, nextCursor: null, pageSize };
  }

  const tokens = trimmed
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0);

  if (!tokens.length) {
    return { phrase: trimmed, items: [], returned: 0, total: 0, hasMore: false, nextCursor: null, pageSize };
  }

  const snippetCap = Math.max(pageSize, sanitizeSnippetCap(maxSnippets));
  const cursorOffset = Math.min(sanitizeCursorOffset(cursor), snippetCap);
  const snippetPadding = sanitizePaddingSeconds(paddingSeconds);
  const fetchTake = Math.max(Math.ceil(snippetCap * RECORD_FETCH_MULTIPLIER), pageSize);

  const selectFields = {
    id: true,
    videoName: true,
    videoUrl: true,
    transcriptFull: true,
    transcriptChunks: true,
    transcript_word_chunks: true,
    transcriptTranslationChunks: true,
    durationSeconds: true,
    audioLevel: true,
  } as const;

  type CandidateRecord = {
    id: number;
    videoName: string;
    videoUrl: string | null;
    transcriptFull: string;
    transcriptChunks: unknown;
    transcript_word_chunks: unknown;
    transcriptTranslationChunks: unknown;
    durationSeconds: number | null;
    audioLevel: number | null;
  };

  const processedIds = new Set<number>();
  const snippets: PhraseSnippet[] = [];

  const appendFromRecords = (records: CandidateRecord[]): boolean => {
    for (const record of records) {
      if (!record.videoUrl) continue;
      if (processedIds.has(record.id)) continue;
      processedIds.add(record.id);

      // OPTIMIZATION: Parse word chunks first (required for matching)
      const wordChunks = parseChunkArray(record.transcript_word_chunks);
      if (!wordChunks.length) continue;

      const matches = findPhraseMatches(wordChunks, tokens);
      if (!matches.length) continue;

      // OPTIMIZATION: Only parse sentence/translation chunks if we have matches
      const sentenceChunks = parseChunkArray(record.transcriptChunks);
      const translationChunks = parseChunkArray(record.transcriptTranslationChunks);

      for (const match of matches) {
        const matchedWordChunks = wordChunks.slice(match.startIndex, match.endIndex + 1);
        if (!matchedWordChunks.length) continue;

        const startTimestamp = matchedWordChunks[0].timestamp[0];
        const endTimestamp = matchedWordChunks[matchedWordChunks.length - 1].timestamp[1];
        const startSeconds = Math.max(0, startTimestamp - snippetPadding);
        const rawEnd = endTimestamp + snippetPadding;
        const duration =
          typeof record.durationSeconds === 'number' && Number.isFinite(record.durationSeconds)
            ? record.durationSeconds
            : null;
        const endSeconds = duration !== null ? Math.min(rawEnd, duration) : rawEnd;
        const minimumDelta = snippetPadding > 0 ? snippetPadding : 0.5;
        const safeEnd = endSeconds > startSeconds ? endSeconds : startSeconds + minimumDelta;
        const snippetId = `${record.id}-${match.startIndex}-${match.endIndex}`;
        const matchedText = formatChunksText(matchedWordChunks);
        let sentenceIndexes: number[] = [];
        if (sentenceChunks.length) {
          sentenceIndexes = findChunkIndexesInRange(sentenceChunks, startTimestamp, endTimestamp);
          if (!sentenceIndexes.length) {
            const fallbackIndex = sentenceChunks.findIndex((chunk) => {
              const [start, end] = chunk.timestamp;
              return startTimestamp >= start && startTimestamp <= end + 0.25;
            });
            if (fallbackIndex >= 0) {
              sentenceIndexes = [fallbackIndex];
            }
          }
        }

        const contextSentenceIndexes =
          sentenceIndexes.length > 0
            ? findChunkIndexesInRange(sentenceChunks, startSeconds, safeEnd)
            : [];

        const englishContextIndexes =
          contextSentenceIndexes.length > 0
            ? contextSentenceIndexes
            : Array.from({ length: match.endIndex - match.startIndex + 1 }, (_, offset) => match.startIndex + offset);

        const contextText =
          sentenceChunks.length && englishContextIndexes.length
            ? buildTextFromChunkIndexes(sentenceChunks, englishContextIndexes)
            : buildContextText(wordChunks, match.startIndex, match.endIndex, CONTEXT_WINDOW);

        const translationMatchedText =
          translationChunks.length && sentenceIndexes.length
            ? buildTextFromChunkIndexes(translationChunks, sentenceIndexes)
            : '';

        const translationContextText =
          translationChunks.length && englishContextIndexes.length
            ? buildTextFromChunkIndexes(translationChunks, englishContextIndexes)
            : translationMatchedText;

        snippets.push({
          id: snippetId,
          contentId: record.id.toString(),
          videoName: record.videoName,
          videoUrl: typeof record.videoUrl === 'string' ? record.videoUrl : '',
          startSeconds,
          endSeconds: safeEnd,
          matchedText,
          contextText,
          phrase: trimmed,
          durationSeconds: duration,
          audioLevel:
            typeof record.audioLevel === 'number' && Number.isFinite(record.audioLevel)
              ? record.audioLevel
              : undefined,
          translationMatchedText: translationMatchedText || undefined,
          translationContextText: translationContextText || undefined,
        });

        if (snippets.length >= snippetCap) {
          return true;
        }

        // only keep a single snippet per video to avoid duplicate fragments from the same content
        break;
      }
    }
    return false;
  };

  const buildResult = () =>
    paginateSnippets(trimmed, snippets, pageSize, cursorOffset, snippetCap);

  const fetchRecords = async (
    where: Prisma.VideoLearningContentWhereInput | undefined,
    skip = 0,
  ): Promise<CandidateRecord[]> => {
    const args: Prisma.VideoLearningContentFindManyArgs = {
      where,
      select: selectFields,
      orderBy: { processedAt: 'desc' },
      take: fetchTake,
    };
    if (skip > 0) {
      args.skip = skip;
    }
    return prisma.videoLearningContent.findMany(args) as Promise<CandidateRecord[]>;
  };

  // Use FULLTEXT search with MATCH AGAINST for optimal performance
  // OPTIMIZATION: Two-stage query to minimize data transfer
  const searchQuery = trimmed.replace(/[+\-<>()~*"@]/g, ' ').trim();

  if (searchQuery) {
    // Stage 1: Get only IDs using FULLTEXT (fast, minimal data transfer)
    const matchedIds = await prisma.$queryRaw<{id: number}[]>`
      SELECT id
      FROM video_learning_content
      WHERE MATCH(transcript_full) AGAINST(${searchQuery} IN NATURAL LANGUAGE MODE)
      ORDER BY processed_at DESC
      LIMIT ${fetchTake}
    `;

    if (matchedIds.length > 0) {
      // Stage 2: Load full data only for matched videos
      const fulltextRecords = await fetchRecords({
        id: { in: matchedIds.map(r => r.id) },
      });
      if (appendFromRecords(fulltextRecords)) {
        return buildResult();
      }
    }
  }

  // Fallback to contains search if FULLTEXT doesn't yield enough results
  if (snippets.length < snippetCap) {
    const containsRecords = await fetchRecords({
      transcriptFull: {
        contains: trimmed,
      },
    });
    if (appendFromRecords(containsRecords)) {
      return buildResult();
    }
  }

  const MAX_FALLBACK_BATCHES = 2;
  for (let batch = 0; batch < MAX_FALLBACK_BATCHES && snippets.length < snippetCap; batch += 1) {
    const fallbackRecords = await fetchRecords(undefined, batch * fetchTake);
    if (!fallbackRecords.length) {
      break;
    }
    if (appendFromRecords(fallbackRecords)) {
      return buildResult();
    }
    if (fallbackRecords.length < fetchTake) {
      break;
    }
  }

  return buildResult();
};

type TokenCandidateRow = {
  contentId: number;
  position: number;
};

type CandidateMatch = {
  contentId: number;
  matchStartPosition: number;
  matchEndPosition: number;
  windowChunks: TranscriptWordChunk[];
  matchStartIndex: number;
  matchEndIndex: number;
  rawStartSeconds: number;
  rawEndSeconds: number;
};

type SnippetContentRecord = {
  id: number;
  videoName: string;
  videoUrl: string | null;
  durationSeconds: number | null;
  audioLevel: number | null;
  transcriptTranslationChunks: unknown;
};

let transcriptTokenBackfillPromise: Promise<void> | null = null;

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (size <= 0 || items.length <= size) {
    return [items];
  }
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const tokenRowsToChunks = (tokens: VideoTranscriptToken[]): TranscriptWordChunk[] =>
  tokens.map((token) => {
    const start = Number.isFinite(token.startSeconds ?? Number.NaN)
      ? Number(token.startSeconds)
      : 0;
    const endCandidate = Number.isFinite(token.endSeconds ?? Number.NaN)
      ? Number(token.endSeconds)
      : start;
    const safeEnd = endCandidate >= start ? endCandidate : start;
    return {
      text: token.token ?? '',
      timestamp: [start, safeEnd] as [number, number],
    };
  });

export const persistTranscriptTokens = async (
  contentId: number,
  wordChunks: TranscriptWordChunk[],
): Promise<void> => {
  if (!wordChunks.length) {
    await prisma.videoTranscriptToken.deleteMany({ where: { contentId } });
    return;
  }

  const payload = wordChunks.map((chunk, index) => {
    const tokenText = String(chunk.text ?? '').slice(0, TOKEN_TEXT_LIMIT);
    const normalized = normalizeToken(chunk.text ?? '').slice(0, TOKEN_TEXT_LIMIT);
    const [start, end] = chunk.timestamp;
    const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
    const safeEnd = Number.isFinite(end) && end >= safeStart ? end : safeStart;
    return {
      contentId,
      position: index,
      token: tokenText,
      tokenNormalized: normalized,
      startSeconds: safeStart,
      endSeconds: safeEnd,
    };
  });

  await prisma.videoTranscriptToken.deleteMany({ where: { contentId } });
  const batches = chunkArray(payload, TOKEN_INSERT_BATCH_SIZE);
  for (const batch of batches) {
    if (!batch.length) continue;
    await prisma.videoTranscriptToken.createMany({
      data: batch,
    });
  }
};

const ensureTranscriptTokensForContent = async (contentId: number): Promise<void> => {
  const existing = await prisma.videoTranscriptToken.findFirst({
    where: { contentId },
    select: { contentId: true },
  });
  if (existing) return;

  const record = await prisma.videoLearningContent.findUnique({
    where: { id: contentId },
    select: { transcript_word_chunks: true },
  });
  if (!record) return;
  const wordChunks = parseChunkArray(record.transcript_word_chunks);
  if (!wordChunks.length) return;
  await persistTranscriptTokens(contentId, wordChunks);
};

const fetchTokenSlice = async (
  contentId: number,
  start: number,
  end: number,
): Promise<VideoTranscriptToken[]> => {
  if (end < start) {
    return [];
  }
  return prisma.videoTranscriptToken.findMany({
    where: {
      contentId,
      position: {
        gte: start,
        lte: end,
      },
    },
    orderBy: { position: 'asc' },
  });
};

const fetchCandidateIdsByFulltext = async (
  searchQuery: string,
  limit: number,
): Promise<number[]> => {
  if (!searchQuery) return [];
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT id
    FROM video_learning_content
    WHERE MATCH(transcript_full) AGAINST(${searchQuery} IN NATURAL LANGUAGE MODE)
    ORDER BY processed_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => row.id);
};

const fetchTokenCandidates = async (
  normalizedToken: string,
  batchSize: number,
  lastCandidate?: TokenCandidateRow | null,
  allowedContentIds?: number[] | null,
): Promise<TokenCandidateRow[]> => {
  if (!normalizedToken) {
    return [];
  }
  const cursorClause = lastCandidate
    ? Prisma.sql`AND (content_id < ${lastCandidate.contentId} OR (content_id = ${lastCandidate.contentId} AND position > ${lastCandidate.position}))`
    : Prisma.sql``;
  const allowedClause =
    allowedContentIds && allowedContentIds.length > 0
      ? Prisma.sql`AND content_id IN (${Prisma.join(allowedContentIds)})`
      : Prisma.sql``;
  return prisma.$queryRaw<TokenCandidateRow[]>`
    SELECT content_id AS contentId, position
    FROM video_transcript_tokens
    WHERE token_normalized = ${normalizedToken}
    ${cursorClause}
    ${allowedClause}
    ORDER BY content_id DESC, position ASC
    LIMIT ${batchSize}
  `;
};

const getTokenFrequencies = async (tokens: string[], allowedContentIds?: number[] | null): Promise<Map<string, number>> => {
  if (!tokens.length) return new Map();
  const allowedClause =
    allowedContentIds && allowedContentIds.length > 0
      ? Prisma.sql`AND content_id IN (${Prisma.join(allowedContentIds)})`
      : Prisma.sql``;
  const rows = await prisma.$queryRaw<Array<{ token: string; count: bigint }>>`
    SELECT token_normalized AS token, COUNT(*) AS count
    FROM video_transcript_tokens
    WHERE token_normalized IN (${Prisma.join(tokens)})
    ${allowedClause}
    GROUP BY token_normalized
  `;
  const map = new Map<string, number>();
  rows.forEach((row) => {
    map.set(row.token, Number(row.count));
  });
  return map;
};

const selectAnchorToken = async (
  normalizedTokens: string[],
  allowedContentIds?: number[] | null,
): Promise<{ token: string; offset: number } | null> => {
  if (!normalizedTokens.length) return null;
  const uniqueTokens = Array.from(new Set(normalizedTokens));
  const frequencies = await getTokenFrequencies(uniqueTokens, allowedContentIds);
  if (frequencies.size === 0) {
    return null;
  }
  for (const token of uniqueTokens) {
    if (!frequencies.has(token)) {
      return null;
    }
  }
  let bestToken = normalizedTokens[0];
  let bestOffset = 0;
  let bestFrequency = frequencies.get(bestToken) ?? Number.MAX_SAFE_INTEGER;
  normalizedTokens.forEach((token, index) => {
    const frequency = frequencies.get(token) ?? Number.MAX_SAFE_INTEGER;
    if (frequency < bestFrequency) {
      bestFrequency = frequency;
      bestToken = token;
      bestOffset = index;
    }
  });
  if (!Number.isFinite(bestFrequency) || bestFrequency === Number.MAX_SAFE_INTEGER) {
    return null;
  }
  return {
    token: bestToken,
    offset: bestOffset,
  };
};

const resolveCandidateMatch = async (
  candidate: TokenCandidateRow,
  normalizedTokens: string[],
  anchorOffset: number,
  ensuredContents: Set<number>,
): Promise<CandidateMatch | null> => {
  const phraseLength = normalizedTokens.length;
  if (!phraseLength) return null;

  const targetStartPosition = candidate.position - anchorOffset;
  if (targetStartPosition < 0) {
    return null;
  }

  const windowStart = Math.max(0, targetStartPosition - TOKEN_CONTEXT_WINDOW);
  const windowEnd = targetStartPosition + phraseLength - 1 + TOKEN_CONTEXT_WINDOW;
  let tokens = await fetchTokenSlice(candidate.contentId, windowStart, windowEnd);
  if (!tokens.length && !ensuredContents.has(candidate.contentId)) {
    await ensureTranscriptTokensForContent(candidate.contentId);
    ensuredContents.add(candidate.contentId);
    tokens = await fetchTokenSlice(candidate.contentId, windowStart, windowEnd);
  }
  if (!tokens.length) return null;

  const tokensByPosition = new Map(tokens.map((token) => [token.position, token]));
  for (let i = 0; i < phraseLength; i += 1) {
    const position = targetStartPosition + i;
    const token = tokensByPosition.get(position);
    if (!token) {
      return null;
    }
    const normalized = (token.tokenNormalized ?? '').trim();
    if (!normalized || normalized !== normalizedTokens[i]) {
      return null;
    }
  }

  const matchStartPosition = targetStartPosition;
  const matchEndPosition = targetStartPosition + phraseLength - 1;
  const matchStartIndex = tokens.findIndex((token) => token.position === matchStartPosition);
  const matchEndIndex = tokens.findIndex((token) => token.position === matchEndPosition);
  if (matchStartIndex === -1 || matchEndIndex === -1) {
    return null;
  }

  const windowChunks = tokenRowsToChunks(tokens);
  const matchedChunks = windowChunks.slice(matchStartIndex, matchEndIndex + 1);
  if (!matchedChunks.length) return null;

  const rawStartSeconds = matchedChunks[0]?.timestamp[0] ?? 0;
  const rawEndSeconds = matchedChunks[matchedChunks.length - 1]?.timestamp[1] ?? rawStartSeconds;

  return {
    contentId: candidate.contentId,
    matchStartPosition,
    matchEndPosition,
    windowChunks,
    matchStartIndex,
    matchEndIndex,
    rawStartSeconds,
    rawEndSeconds,
  };
};

const loadSnippetContent = async (
  contentId: number,
  cache: Map<number, SnippetContentRecord>,
): Promise<SnippetContentRecord | null> => {
  if (cache.has(contentId)) {
    return cache.get(contentId) ?? null;
  }
  const record = await prisma.videoLearningContent.findUnique({
    where: { id: contentId },
    select: {
      id: true,
      videoName: true,
      videoUrl: true,
      durationSeconds: true,
      audioLevel: true,
      transcriptTranslationChunks: true,
    },
  });
  if (!record) {
    return null;
  }
  cache.set(contentId, record);
  return record;
};

const buildSnippetFromMatch = async (
  match: CandidateMatch,
  options: { phrase: string; snippetPadding: number },
  cache: Map<number, SnippetContentRecord>,
): Promise<PhraseSnippet | null> => {
  const metadata = await loadSnippetContent(match.contentId, cache);
  if (!metadata || !metadata.videoUrl) {
    return null;
  }

  const matchedChunks = match.windowChunks.slice(match.matchStartIndex, match.matchEndIndex + 1);
  const matchedText = formatChunksText(matchedChunks);
  if (!matchedText) return null;
  const contextText = buildContextText(
    match.windowChunks,
    match.matchStartIndex,
    match.matchEndIndex,
    CONTEXT_WINDOW,
  );

  const paddedStart = Math.max(0, match.rawStartSeconds - options.snippetPadding);
  const rawEndWithPadding = match.rawEndSeconds + options.snippetPadding;
  const duration =
    typeof metadata.durationSeconds === 'number' && Number.isFinite(metadata.durationSeconds)
      ? metadata.durationSeconds
      : null;
  const clampedEnd = duration !== null ? Math.min(rawEndWithPadding, duration) : rawEndWithPadding;
  const minimumDelta = options.snippetPadding > 0 ? options.snippetPadding : 0.5;
  const safeEnd = clampedEnd > paddedStart ? clampedEnd : paddedStart + minimumDelta;

  const translationChunks = parseChunkArray(metadata.transcriptTranslationChunks);
  const translationIndexes = translationChunks.length
    ? findChunkIndexesInRange(translationChunks, match.rawStartSeconds, match.rawEndSeconds)
    : [];
  const translationMatchedText = translationIndexes.length
    ? buildTextFromChunkIndexes(translationChunks, translationIndexes)
    : '';
  const translationContextIndexes = translationChunks.length
    ? findChunkIndexesInRange(translationChunks, paddedStart, safeEnd)
    : [];
  const translationContextText = translationContextIndexes.length
    ? buildTextFromChunkIndexes(translationChunks, translationContextIndexes)
    : translationMatchedText;

  return {
    id: `${match.contentId}-${match.matchStartPosition}-${match.matchEndPosition}`,
    contentId: match.contentId.toString(),
    videoName: metadata.videoName,
    videoUrl: metadata.videoUrl ?? '',
    startSeconds: paddedStart,
    endSeconds: safeEnd,
    matchedText,
    contextText,
    phrase: options.phrase,
    durationSeconds: duration,
    audioLevel:
      typeof metadata.audioLevel === 'number' && Number.isFinite(metadata.audioLevel)
        ? metadata.audioLevel
        : undefined,
    translationMatchedText: translationMatchedText || undefined,
    translationContextText: translationContextText || undefined,
  };
};

const triggerTranscriptTokenBackfill = (): void => {
  if (transcriptTokenBackfillPromise) {
    return;
  }
  transcriptTokenBackfillPromise = (async () => {
    let lastId = 0;
    let hasMore = true;
    while (hasMore) {
      const records = await prisma.videoLearningContent.findMany({
        where: lastId > 0 ? { id: { gt: lastId } } : undefined,
        orderBy: { id: 'asc' },
        select: { id: true, transcript_word_chunks: true },
        take: TRANSCRIPT_BACKFILL_BATCH_SIZE,
      });
      if (!records.length) {
        break;
      }
      for (const record of records) {
        lastId = record.id;
        const chunks = parseChunkArray(record.transcript_word_chunks);
        if (!chunks.length) continue;
        await persistTranscriptTokens(record.id, chunks);
      }
      hasMore = records.length === TRANSCRIPT_BACKFILL_BATCH_SIZE;
    }
  })()
    .catch((error) => {
      console.error('[VideoLearning] Failed to backfill transcript tokens', error);
    })
    .finally(() => {
      transcriptTokenBackfillPromise = null;
    });
};

const runTokenSearch = async (
  normalizedTokens: string[],
  trimmedPhrase: string,
  snippetPadding: number,
  snippetCap: number,
  allowedContentIds: number[] | null,
): Promise<PhraseSnippet[]> => {
  const anchor = await selectAnchorToken(normalizedTokens, allowedContentIds);
  if (!anchor) {
    return [];
  }

  const snippets: PhraseSnippet[] = [];
  const processedContentIds = new Set<number>();
  const ensuredContents = new Set<number>();
  const metadataCache = new Map<number, SnippetContentRecord>();

  let candidateCursor: TokenCandidateRow | null = null;
  let batchCount = 0;

  while (snippets.length < snippetCap && batchCount < MAX_TOKEN_CANDIDATE_BATCHES) {
    const candidates = await fetchTokenCandidates(
      anchor.token,
      TOKEN_CANDIDATE_BATCH_SIZE,
      candidateCursor,
      allowedContentIds,
    );
    batchCount += 1;

    if (!candidates.length) {
      break;
    }

    for (const candidate of candidates) {
      candidateCursor = candidate;
      if (processedContentIds.has(candidate.contentId)) {
        continue;
      }

      const match = await resolveCandidateMatch(
        candidate,
        normalizedTokens,
        anchor.offset,
        ensuredContents,
      );
      if (!match) {
        continue;
      }

      const snippet = await buildSnippetFromMatch(
        match,
        { phrase: trimmedPhrase, snippetPadding },
        metadataCache,
      );
      if (!snippet) {
        continue;
      }

      snippets.push(snippet);
      processedContentIds.add(candidate.contentId);
      if (snippets.length >= snippetCap) {
        break;
      }
    }

    if (candidates.length < TOKEN_CANDIDATE_BATCH_SIZE) {
      break;
    }
  }

  return snippets;
};

const searchPhrase = async (
  phrase: string,
  limit?: number,
  paddingSeconds?: number,
  cursor?: number,
  maxSnippets?: number,
): Promise<PhraseSearchResult> => {
  const trimmed = (phrase ?? '').trim();
  const pageSize = sanitizeSnippetLimit(limit);
  if (!trimmed) {
    return {
      phrase: '',
      items: [],
      returned: 0,
      total: 0,
      hasMore: false,
      nextCursor: null,
      pageSize,
    };
  }

  const normalizedTokens = trimmed
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0);

  if (!normalizedTokens.length) {
    return {
      phrase: trimmed,
      items: [],
      returned: 0,
      total: 0,
      hasMore: false,
      nextCursor: null,
      pageSize,
    };
  }

  const snippetCap = Math.max(pageSize, sanitizeSnippetCap(maxSnippets));
  const cursorOffset = Math.min(sanitizeCursorOffset(cursor), snippetCap);
  const snippetPadding = sanitizePaddingSeconds(paddingSeconds);
  const searchQuery = trimmed.replace(/[+\-<>()~*"@]/g, ' ').trim();
  const candidateIdsByFulltext = searchQuery
    ? await fetchCandidateIdsByFulltext(searchQuery, FULLTEXT_CANDIDATE_LIMIT)
    : [];
  const allowedContentIds = candidateIdsByFulltext.length > 0 ? candidateIdsByFulltext : null;

  let snippets = await runTokenSearch(
    normalizedTokens,
    trimmed,
    snippetPadding,
    snippetCap,
    allowedContentIds,
  );

  if (!snippets.length && !allowedContentIds) {
    triggerTranscriptTokenBackfill();
    return paginateSnippets(trimmed, [], pageSize, cursorOffset, snippetCap);
  }

  if (!snippets.length && allowedContentIds) {
    snippets = await runTokenSearch(normalizedTokens, trimmed, snippetPadding, snippetCap, null);
  }

  if (!snippets.length) {
    triggerTranscriptTokenBackfill();
    return paginateSnippets(trimmed, [], pageSize, cursorOffset, snippetCap);
  }

  return paginateSnippets(trimmed, snippets, pageSize, cursorOffset, snippetCap);
};

const updateLikeStatus = async (userId: string, contentId: string, like: boolean): Promise<LikeStatus> => {
  const numericContentId = Number(contentId);
  if (!Number.isInteger(numericContentId)) {
    throw Object.assign(new Error('Invalid content identifier'), { status: 400 });
  }

  // Invalidate user cache when like status changes
  invalidateUserCache(userId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.videoLike.findUnique({
      where: { userId_contentId: { userId, contentId: numericContentId } },
    });

    if (like) {
      if (!existing) {
        await tx.videoLike.create({
          data: {
            userId,
            contentId: numericContentId,
          },
        });
        await tx.videoLearningContent.update({
          where: { id: numericContentId },
          data: { likesCount: { increment: 1 } },
        });
        await adjustTopicPreferences(tx, userId, numericContentId, 1);
      }
      const updated = await tx.videoLearningContent.findUnique({
        where: { id: numericContentId },
        select: { likesCount: true },
      });
      return {
        likesCount: updated?.likesCount ?? 0,
        isLiked: true,
      };
    }

    if (existing) {
      await tx.videoLike.delete({
        where: { userId_contentId: { userId, contentId: numericContentId } },
      });
      await tx.videoLearningContent.update({
        where: { id: numericContentId },
        data: { likesCount: { decrement: 1 } },
      });
      await adjustTopicPreferences(tx, userId, numericContentId, -1);
    }
    const updated = await tx.videoLearningContent.findUnique({
      where: { id: numericContentId },
      select: { likesCount: true },
    });
    if ((updated?.likesCount ?? 0) < 0) {
      await tx.videoLearningContent.update({
        where: { id: numericContentId },
        data: { likesCount: 0 },
      });
      return {
        likesCount: 0,
        isLiked: false,
      };
    }
    return {
      likesCount: updated?.likesCount ?? 0,
      isLiked: false,
    };
  });
};

const getContentById = async (id: string, userId?: string | null): Promise<ProcessedVideo | null> => {
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    throw Object.assign(new Error('Invalid content identifier'), { status: 400 });
  }
  const record = await prisma.videoLearningContent.findUnique({
    where: { id: numericId },
  });
  if (!record) {
    return null;
  }

  let likedByUser = false;

  if (userId) {
    // OPTIMIZATION: Single SQL query instead of find + create/update (3 queries → 1 query)
    // Use INSERT ... ON DUPLICATE KEY UPDATE with conditional logic
    try {
      await prisma.$executeRaw`
        INSERT INTO video_learning_progress (user_id, content_id, status, created_at, updated_at)
        VALUES (${userId}, ${numericId}, 'WATCHED', NOW(), NOW())
        ON DUPLICATE KEY UPDATE
          status = IF(status = 'NOT_STARTED', 'WATCHED', status),
          updated_at = NOW()
      `;
    } catch (error) {
      // Ignore unique constraint errors from race conditions
      console.log('[VideoLearning] Progress update skipped due to race condition');
    }

    // OPTIMIZATION: Fetch like status (only 1 extra query, moderation is from record)
    const likeRecord = await prisma.videoLike.findUnique({
      where: {
        userId_contentId: {
          userId,
          contentId: numericId,
        },
      },
    });
    likedByUser = Boolean(likeRecord);
  }

  // OPTIMIZATION: Get moderation from record directly instead of separate query
  const moderation = {
    isAdultContent: record.isAdultContent ?? false,
    isModerated: record.isModerated ?? false,
  };
  return mapContentRecord(record as ContentRecord, likedByUser, moderation);
};

const getContentOrThrow = async (id: string): Promise<ProcessedVideo> => {
  const content = await getContentById(id);
  if (!content) {
    throw Object.assign(new Error('Video learning content not found'), { status: 404 });
  }
  return content;
};

const updateCefrLevel = async (id: string, payload: UpdateCefrLevelInput): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: { cefrLevel: payload.cefrLevel },
  });
  return getContentOrThrow(String(numericId));
};

const updateSpeechSpeed = async (id: string, payload: UpdateSpeechSpeedInput): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: { speechSpeed: payload.speechSpeed },
  });
  return getContentOrThrow(String(numericId));
};

const updateGrammarComplexity = async (
  id: string,
  payload: UpdateGrammarComplexityInput,
): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: { grammarComplexity: payload.grammarComplexity },
  });
  return getContentOrThrow(String(numericId));
};

const updateVocabularyComplexity = async (
  id: string,
  payload: UpdateVocabularyComplexityInput,
): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: { vocabularyComplexity: payload.vocabularyComplexity },
  });
  return getContentOrThrow(String(numericId));
};

const updateTopics = async (id: string, payload: UpdateTopicsInput): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  const normalizedTopics = normalizeTopicsForStorage(payload.topics);

  await prisma.$transaction(async (tx) => {
    await tx.videoTopic.deleteMany({ where: { contentId: numericId } });
    if (normalizedTopics.length > 0) {
      await tx.videoTopic.createMany({
        data: normalizedTopics.map((topic) => ({ contentId: numericId, topic })),
        skipDuplicates: true,
      });
    }
    await tx.videoLearningContent.update({
      where: { id: numericId },
      data: {
        topics: normalizedTopics,
      },
    });
  });

  return getContentOrThrow(String(numericId));
};

const updateTranscriptChunks = async (
  id: string,
  payload: UpdateTranscriptChunksInput,
): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  const sanitized = sanitizeTranscriptChunksForStorage(payload.chunks);
  const fullText = buildFullTextFromChunks(sanitized);

  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: {
      transcriptChunks: sanitized as unknown as Prisma.JsonArray,
      transcriptFull: fullText,
    },
  });

  return getContentOrThrow(String(numericId));
};

const updateTranslationChunks = async (
  id: string,
  payload: UpdateTranslationChunksInput,
): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  const sanitized = sanitizeTranslationChunksForStorage(payload.chunks);
  const fullText = buildFullTextFromChunks(sanitized);

  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: {
      transcriptTranslationChunks: sanitized as unknown as Prisma.JsonArray,
      transcriptTranslationFull: fullText.length > 0 ? fullText : null,
    },
  });

  return getContentOrThrow(String(numericId));
};

const updateSubtitleChunk = async (
  id: string,
  payload: UpdateSubtitleChunkInput,
): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  const record = await prisma.videoLearningContent.findUnique({
    where: { id: numericId },
    select: {
      transcriptChunks: true,
      transcriptTranslationChunks: true,
    },
  });

  if (!record) {
    throw Object.assign(new Error('Video learning content not found'), { status: 404 });
  }

  const transcriptChunks = sanitizeStoredChunks(record.transcriptChunks);
  if (!transcriptChunks.length) {
    throw Object.assign(new Error('Transcript is empty'), { status: 400 });
  }
  if (payload.chunkIndex < 0 || payload.chunkIndex >= transcriptChunks.length) {
    throw Object.assign(new Error('Transcript chunk not found'), { status: 404 });
  }

  const translationChunks = sanitizeStoredChunks(record.transcriptTranslationChunks);
  const [replacementTranscript] = sanitizeTranscriptChunksForStorage([payload.transcript]);
  const [replacementTranslation] = sanitizeTranslationChunksForStorage([payload.translation]);

  const nextTranscriptChunks = [...transcriptChunks];
  nextTranscriptChunks[payload.chunkIndex] = replacementTranscript;

  const nextTranslationChunks = [...translationChunks];
  while (nextTranslationChunks.length <= payload.chunkIndex) {
    const placeholderIndex = nextTranslationChunks.length;
    const fallbackTimestamp =
      transcriptChunks[placeholderIndex]?.timestamp ?? replacementTranslation.timestamp;
    const start = Number(fallbackTimestamp?.[0] ?? 0);
    const endSource = Number(fallbackTimestamp?.[1] ?? fallbackTimestamp?.[0] ?? 0);
    const end = Number.isFinite(endSource) && endSource >= start ? endSource : start;
    nextTranslationChunks.push({
      text: '',
      timestamp: [start, end] as [number, number],
    });
  }
  nextTranslationChunks[payload.chunkIndex] = replacementTranslation;

  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: {
      transcriptChunks: nextTranscriptChunks as unknown as Prisma.JsonArray,
      transcriptFull: buildFullTextFromChunks(nextTranscriptChunks),
      transcriptTranslationChunks: nextTranslationChunks as unknown as Prisma.JsonArray,
      transcriptTranslationFull: buildFullTextFromChunks(nextTranslationChunks) || null,
    },
  });

  return getContentOrThrow(String(numericId));
};

const updateExercises = async (id: string, payload: UpdateExercisesInput): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  const normalized = normalizeExercisesForStorage(payload.exercises);

  await prisma.videoLearningContent.update({
    where: { id: numericId },
    data: { exercises: normalized },
  });

  return getContentOrThrow(String(numericId));
};

const updateIsAdultContent = async (
  id: string,
  payload: UpdateIsAdultContentInput,
): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  await prisma.$executeRaw`
    UPDATE video_learning_content
    SET is_adult_content = ${payload.isAdultContent ? 1 : 0}
    WHERE id = ${numericId}
  `;
  return getContentOrThrow(String(numericId));
};

const updateModerationStatus = async (
  id: string,
  payload: UpdateModerationStatusInput,
): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(id);
  await prisma.$executeRaw`
    UPDATE video_learning_content
    SET is_moderated = ${payload.isModerated ? 1 : 0}
    WHERE id = ${numericId}
  `;
  return getContentOrThrow(String(numericId));
};

const deleteVideo = async (id: string): Promise<void> => {
  const numericId = ensureContentNumericId(id);
  await prisma.videoLearningContent.delete({
    where: { id: numericId },
  });
};

const submitProgress = async (
  userId: string,
  contentId: string,
  answers: SubmitExerciseAnswer[],
) => {
  const numericContentId = Number(contentId);
  if (!Number.isInteger(numericContentId)) {
    throw Object.assign(new Error('Invalid content identifier'), { status: 400 });
  }

  // Invalidate user cache when progress changes
  invalidateUserCache(userId);

  const record = await prisma.videoLearningContent.findUnique({
    where: { id: numericContentId },
  });
  if (!record) {
    throw Object.assign(new Error('Video learning content not found'), { status: 404 });
  }

  const moderation = await fetchModerationFlag(numericContentId);
  const mapped = mapContentRecord(record as ContentRecord, false, moderation);
  const exercises = mapped.exercises;

  const serializeAnswers = (input: SubmitExerciseAnswer[]): Prisma.JsonArray =>
    input.map((item) => ({ ...item })) as unknown as Prisma.JsonArray;

  if (!exercises.length) {
    const emptyAnswers = serializeAnswers([]);
    await prisma.videoLearningProgress.upsert({
      where: { userId_contentId: { userId, contentId: numericContentId } },
      update: { status: VideoLearningStatus.COMPLETED, answers: emptyAnswers, score: exercises.length },
      create: { userId, contentId: numericContentId, status: VideoLearningStatus.COMPLETED, answers: emptyAnswers, score: exercises.length },
    });
    return {
      total: 0,
      correct: 0,
      incorrect: [],
      completed: true,
    };
  }

  const answerMap = new Map(answers.map((item) => [item.exerciseId, item.selectedOption]));
  const incorrect: Array<{ exerciseId: string; correctAnswer: number; selected?: number }> = [];
  let correctCount = 0;

  for (const exercise of exercises) {
    const given = answerMap.get(exercise.id);
    if (given === undefined || given !== exercise.correctAnswer) {
      incorrect.push({ exerciseId: exercise.id, correctAnswer: exercise.correctAnswer, selected: given });
    } else {
      correctCount += 1;
    }
  }

  const completed = incorrect.length === 0;
  const serializedAnswers = serializeAnswers(answers);

  await prisma.videoLearningProgress.upsert({
    where: { userId_contentId: { userId, contentId: numericContentId } },
    update: {
      status: completed ? VideoLearningStatus.COMPLETED : VideoLearningStatus.WATCHED,
      answers: serializedAnswers,
      score: correctCount,
    },
    create: {
      userId,
      contentId: numericContentId,
      status: completed ? VideoLearningStatus.COMPLETED : VideoLearningStatus.WATCHED,
      answers: serializedAnswers,
      score: correctCount,
    },
  });

  return {
    total: exercises.length,
    correct: correctCount,
    incorrect,
    completed,
  };
};

const getAuthors = async (): Promise<Array<{ username: string }>> => {
  const authors = await prisma.author.findMany({
    select: { username: true },
    orderBy: { username: 'asc' },
  });
  return authors;
};

const updateAuthor = async (contentId: string, author: string | null): Promise<ProcessedVideo> => {
  const numericId = ensureContentNumericId(contentId);
  const sanitized = author ? author.trim() : null;
  const authorValue = sanitized ? sanitized : null;

  await prisma.$transaction(async (tx) => {
    await tx.videoLearningContent.update({
      where: { id: numericId },
      data: { author: authorValue },
    });

    if (authorValue) {
      await tx.author.upsert({
        where: { username: authorValue },
        update: { lastVideoAt: new Date() },
        create: { username: authorValue },
      });
    }
  });

  return getContentOrThrow(String(numericId));
};

export const videoLearningService = {
  getFeed,
  searchPhrase,
  getContentById,
  updateLikeStatus,
  updateCefrLevel,
  updateSpeechSpeed,
  updateGrammarComplexity,
  updateVocabularyComplexity,
  updateTopics,
  updateTranscriptChunks,
  updateTranslationChunks,
  updateSubtitleChunk,
  updateExercises,
  updateIsAdultContent,
  updateModerationStatus,
  deleteVideo,
  submitProgress,
  getAuthors,
  updateAuthor,
};
