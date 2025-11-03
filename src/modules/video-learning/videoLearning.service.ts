import { Prisma, VideoLearningStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

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
};

const parseChunkArray = (value: unknown): TranscriptWordChunk[] => {
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
    .replace(/[^a-z0-9']+/g, '');

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

type PhraseMatch = {
  startIndex: number;
  endIndex: number;
};

const DEFAULT_SNIPPET_LIMIT = 10;
const MAX_SNIPPET_LIMIT = 50;
const CONTEXT_WINDOW = 4;
const MATCH_PADDING_SECONDS = 1;
const RECORD_FETCH_MULTIPLIER = 3;

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

const mapContentRecord = (record: ContentRecord, isLiked = false): ProcessedVideo => {
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
    createdAt: (record.processedAt ?? new Date()).toISOString(),
    updatedAt: (record.processedAt ?? new Date()).toISOString(),
  };
};

const computeRecommendationScores = async (
  userId: string,
  excludeIds: Set<number>,
  cefrLevels?: string,
) => {
  const [likedRecords, topicPreferences, progressRecords] = await Promise.all([
    prisma.videoLike.findMany({
      where: { userId },
      select: { contentId: true },
    }),
    prisma.videoTopicPreference.findMany({
      where: { userId },
      select: { topic: true, likes: true },
    }),
    prisma.videoLearningProgress.findMany({
      where: { userId },
      select: {
        contentId: true,
        status: true,
        content: {
          select: {
            id: true,
            videoTopics: {
              select: { topic: true },
            },
          },
        },
      },
    }),
  ]);

  const likedSet = new Set(likedRecords.map((item) => item.contentId));
  const topicScoreMap = new Map(topicPreferences.map((item) => [item.topic, item.likes]));
  const watchedSet = new Set<number>();
  const statusMap = new Map<number, VideoLearningStatus>();

  for (const record of progressRecords) {
    watchedSet.add(record.contentId);
    statusMap.set(record.contentId, record.status);
    if (!likedSet.has(record.contentId)) {
      for (const topicEntry of record.content.videoTopics) {
        const current = topicScoreMap.get(topicEntry.topic) ?? 0;
        topicScoreMap.set(topicEntry.topic, current - 1);
      }
    }
  }

  // Parse cefrLevels filter
  const allowedLevels = cefrLevels
    ? cefrLevels.split(',').map(level => level.trim().toUpperCase())
    : null;

  const candidateRecords = await prisma.videoLearningContent.findMany({
    where: allowedLevels && allowedLevels.length > 0 ? {
      cefrLevel: {
        in: allowedLevels as any,
      },
    } : undefined,
    include: {
      videoTopics: {
        select: { topic: true },
      },
    },
  });

  const scored = candidateRecords
    .filter((record) => !excludeIds.has(record.id))
    .map((record) => {
      const topics = record.videoTopics.map((topic) => topic.topic);
      const topicScore = topics.reduce((sum, topic) => sum + (topicScoreMap.get(topic) ?? 0), 0);
      const popularityScore = Math.log10((record.likesCount ?? 0) + 1);
      const likedBoost = likedSet.has(record.id) ? 30 : 0;
      const watchedPenalty = watchedSet.has(record.id) ? 25 : 0;

      const score = topicScore * 12 + popularityScore * 5 + likedBoost - watchedPenalty;

      return {
        record,
        score,
        isWatched: watchedSet.has(record.id),
      };
    });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.record.likesCount ?? 0) !== (a.record.likesCount ?? 0)) {
      return (b.record.likesCount ?? 0) - (a.record.likesCount ?? 0);
    }
    return a.record.id - b.record.id;
  });

  const unwatched = scored.filter((item) => !item.isWatched);
  const watched = scored.filter((item) => item.isWatched);

  return { likedSet, statusMap, unwatched, watched };
};

const getFeed = async (
  userId: string,
  limit?: number,
  cursor?: string | null,
  cefrLevels?: string,
): Promise<{ items: VideoFeedItem[]; nextCursor: string | null; hasMore: boolean }> => {
  const normalizedLimit = limit && limit > 0 ? limit : 1;

  const excludeIds = new Set<number>();
  if (cursor) {
    cursor
      .split(',')
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0)
      .forEach((value) => excludeIds.add(value));
  }

  const { likedSet, statusMap, unwatched, watched } = await computeRecommendationScores(userId, excludeIds, cefrLevels);

  const combined = [...unwatched, ...watched];
  if (!combined.length) {
    return { items: [], nextCursor: null, hasMore: false };
  }

  const selected = combined.slice(0, normalizedLimit);
  const hasMore = combined.length > normalizedLimit;

  const items: VideoFeedItem[] = selected.map(({ record }) => {
    const { videoTopics: _topics, ...rest } = record;
    const processed = mapContentRecord(rest as ContentRecord, likedSet.has(record.id));
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
    };
  });

  const nextCursorSet = new Set<number>(excludeIds);
  for (const item of selected) {
    nextCursorSet.add(item.record.id);
  }

  const nextCursor =
    hasMore && nextCursorSet.size > 0 ? Array.from(nextCursorSet).sort((a, b) => a - b).join(',') : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
};

const searchPhrase = async (phrase: string, limit?: number): Promise<PhraseSearchResult> => {
  const trimmed = (phrase ?? '').trim();
  if (!trimmed) {
    return { phrase: '', items: [], returned: 0 };
  }

  const tokens = trimmed
    .split(/\s+/)
    .map(normalizeToken)
    .filter((token) => token.length > 0);

  if (!tokens.length) {
    return { phrase: trimmed, items: [], returned: 0 };
  }

  const snippetsLimit = sanitizeSnippetLimit(limit);
  const fetchTake = Math.max(snippetsLimit * RECORD_FETCH_MULTIPLIER, snippetsLimit);

  const candidates = await prisma.videoLearningContent.findMany({
    where: {
      transcriptFull: {
        contains: trimmed,
      },
    },
    select: {
      id: true,
      videoName: true,
      videoUrl: true,
      transcriptFull: true,
      transcript_word_chunks: true,
      durationSeconds: true,
      audioLevel: true,
    },
    orderBy: {
      processedAt: 'desc',
    },
    take: fetchTake,
  });

  const snippets: PhraseSnippet[] = [];

  for (const record of candidates) {
    if (!record.videoUrl) continue;

    const wordChunks = parseChunkArray(record.transcript_word_chunks);
    if (!wordChunks.length) continue;

    const matches = findPhraseMatches(wordChunks, tokens);
    if (!matches.length) continue;

    for (const match of matches) {
      const matchedWordChunks = wordChunks.slice(match.startIndex, match.endIndex + 1);
      if (!matchedWordChunks.length) continue;

      const startTimestamp = matchedWordChunks[0].timestamp[0];
      const endTimestamp = matchedWordChunks[matchedWordChunks.length - 1].timestamp[1];
      const startSeconds = Math.max(0, startTimestamp - MATCH_PADDING_SECONDS);
      const rawEnd = endTimestamp + MATCH_PADDING_SECONDS;
      const duration =
        typeof record.durationSeconds === 'number' && Number.isFinite(record.durationSeconds)
          ? record.durationSeconds
          : null;
      const endSeconds = duration !== null ? Math.min(rawEnd, duration) : rawEnd;
      const safeEnd = endSeconds > startSeconds ? endSeconds : startSeconds + MATCH_PADDING_SECONDS;
      const snippetId = `${record.id}-${match.startIndex}-${match.endIndex}`;
      const matchedText = formatChunksText(matchedWordChunks);
      const contextText = buildContextText(wordChunks, match.startIndex, match.endIndex, CONTEXT_WINDOW);

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
      });

      if (snippets.length >= snippetsLimit) {
        return { phrase: trimmed, items: snippets.slice(0, snippetsLimit), returned: snippetsLimit };
      }
    }
  }

  const returned = Math.min(snippets.length, snippetsLimit);
  return { phrase: trimmed, items: snippets.slice(0, snippetsLimit), returned };
};

const updateLikeStatus = async (userId: string, contentId: string, like: boolean): Promise<LikeStatus> => {
  const numericContentId = Number(contentId);
  if (!Number.isInteger(numericContentId)) {
    throw Object.assign(new Error('Invalid content identifier'), { status: 400 });
  }

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
    try {
      // Check if progress already exists
      const existingProgress = await prisma.videoLearningProgress.findUnique({
        where: {
          userId_contentId: {
            userId,
            contentId: numericId,
          },
        },
      });

      if (existingProgress) {
        // Only update if status is NOT_STARTED
        if (existingProgress.status === VideoLearningStatus.NOT_STARTED) {
          await prisma.videoLearningProgress.update({
            where: {
              userId_contentId: {
                userId,
                contentId: numericId,
              },
            },
            data: {
              status: VideoLearningStatus.WATCHED,
            },
          });
        }
      } else {
        // Create new progress record
        await prisma.videoLearningProgress.create({
          data: {
            userId,
            contentId: numericId,
            status: VideoLearningStatus.WATCHED,
          },
        });
      }
    } catch (error) {
      // Ignore unique constraint errors from race conditions
      console.log('[VideoLearning] Progress update skipped due to race condition');
    }

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

  return mapContentRecord(record as ContentRecord, likedByUser);
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
  const record = await prisma.videoLearningContent.findUnique({
    where: { id: numericContentId },
  });
  if (!record) {
    throw Object.assign(new Error('Video learning content not found'), { status: 404 });
  }

  const mapped = mapContentRecord(record as ContentRecord);
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

export const videoLearningService = {
  getFeed,
  searchPhrase,
  getContentById,
  updateLikeStatus,
  submitProgress,
};



