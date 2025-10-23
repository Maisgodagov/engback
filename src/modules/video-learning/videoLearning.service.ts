import { VideoLearningStatus } from '@prisma/client';
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
  transcriptTranslationFull: string | null;
  transcriptTranslationChunks: unknown;
  exercises: unknown;
  durationSeconds: number | null;
  audioLevel: number | null;
  processedAt: Date | null;
  status: string | null;
};

const normalizeExercises = (raw: unknown): Exercise[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    if (item && typeof item === 'object') {
      const typed = item as Partial<Exercise> & Record<string, unknown>;
      const id = typeof typed.id === 'string' && typed.id.trim() ? typed.id : `exercise-${index + 1}-${randomUUID()}`;
      const options = Array.isArray(typed.options) ? typed.options.map(String) : [];
      const correct =
        typeof typed.correctAnswer === 'number' && Number.isInteger(typed.correctAnswer) ? typed.correctAnswer : 0;
      return {
        id,
        type: (typed.type as Exercise['type']) ?? 'vocabulary',
        question: typeof typed.question === 'string' ? typed.question : '',
        options,
        correctAnswer: options.length ? Math.max(0, Math.min(options.length - 1, correct)) : 0,
        word: typeof (typed as any).word === 'string' ? (typed as any).word : undefined,
      } as Exercise;
    }
    return {
      id: `exercise-${index + 1}-${randomUUID()}`,
      type: 'vocabulary',
      question: '',
      options: [],
      correctAnswer: 0,
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

const mapTranscription = (fullText: string, chunksValue: unknown): TranscriptionResult => {
  const chunks = Array.isArray(chunksValue)
    ? (chunksValue as unknown[]).map((chunk) => {
        if (!chunk || typeof chunk !== 'object') {
          return { text: '', timestamp: [0, 0] as [number, number] };
        }
        const candidate = chunk as Record<string, unknown>;
        const timestampValue = candidate.timestamp;
        const timestamp =
          Array.isArray(timestampValue) && timestampValue.length === 2
            ? ([Number(timestampValue[0]) || 0, Number(timestampValue[1]) || 0] as [number, number])
            : ([0, 0] as [number, number]);
        return {
          text: typeof candidate.text === 'string' ? candidate.text : '',
          timestamp,
        };
      })
    : [];

  return {
    fullText: fullText ?? '',
    text: fullText ?? '',
    chunks,
  };
};

const mapTranslation = (fullText: string | null, chunksValue: unknown): TranslationResult =>
  mapTranscription(fullText ?? '', chunksValue);

const mapContentRecord = (record: ContentRecord): ProcessedVideo => {
  const transcription = mapTranscription(record.transcriptFull ?? '', record.transcriptChunks);
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
    videoUrl: record.videoUrl ?? '',
    durationSeconds: record.durationSeconds,
    audioLevel: record.audioLevel ?? undefined,
    transcription,
    translation,
    analysis,
    exercises,
    createdAt: (record.processedAt ?? new Date()).toISOString(),
    updatedAt: (record.processedAt ?? new Date()).toISOString(),
  };
};

const statusWeight = (status: VideoLearningStatus | null | undefined): number => {
  switch (status) {
    case VideoLearningStatus.NOT_STARTED:
      return 0;
    case VideoLearningStatus.WATCHED:
      return 1;
    case VideoLearningStatus.COMPLETED:
      return 2;
    default:
      return 3;
  }
};

const getFeed = async (
  userId?: string | null,
  limit?: number,
  cursor?: string | null
): Promise<{ items: VideoFeedItem[]; nextCursor: string | null; hasMore: boolean }> => {
  const normalizedLimit = limit && limit > 0 ? limit : undefined;

  const progress = userId
    ? await prisma.videoLearningProgress.findMany({
        where: { userId },
      })
    : [];

  const progressMap = new Map(progress.map((item) => [item.contentId, item.status]));

  const allContents = await prisma.videoLearningContent.findMany({
    orderBy: { id: 'asc' },
  });

  const sortedByStatus = allContents
    .map((record) => {
      const status = progressMap.get(record.id) ?? VideoLearningStatus.NOT_STARTED;
      return {
        status,
        record,
      };
    })
    .sort((a, b) => {
      const weightDiff = statusWeight(a.status) - statusWeight(b.status);
      if (weightDiff !== 0) {
        return weightDiff;
      }
      return a.record.id - b.record.id;
    });

  const feedItems: VideoFeedItem[] = sortedByStatus.map(({ record, status }) => ({
    id: record.id.toString(),
    videoName: record.videoName,
    videoUrl: record.videoUrl ?? '',
    durationSeconds: record.durationSeconds,
    audioLevel: record.audioLevel ?? undefined,
    analysis: {
      cefrLevel: (record.cefrLevel as AnalysisResult['cefrLevel']) ?? 'A1',
      speechSpeed: (record.speechSpeed as AnalysisResult['speechSpeed']) ?? 'normal',
      grammarComplexity: (record.grammarComplexity as AnalysisResult['grammarComplexity']) ?? 'simple',
      vocabularyComplexity: (record.vocabularyComplexity as AnalysisResult['vocabularyComplexity']) ?? 'basic',
      topics: mapTopics(record.topics),
    },
    status,
    createdAt: (record.processedAt ?? new Date()).toISOString(),
  }));

  let startIndex = 0;
  if (cursor) {
    const cursorIndex = feedItems.findIndex((item) => item.id === cursor);
    if (cursorIndex >= 0) {
      startIndex = cursorIndex + 1;
    }
  }

  const sliceFromCursor = feedItems.slice(startIndex);

  if (!normalizedLimit) {
    return {
      items: sliceFromCursor,
      nextCursor: null,
      hasMore: false,
    };
  }

  const limitedItems = sliceFromCursor.slice(0, normalizedLimit);
  const hasMore = sliceFromCursor.length > limitedItems.length;
  const nextCursor = hasMore ? limitedItems[limitedItems.length - 1]?.id ?? null : null;

  return {
    items: limitedItems,
    nextCursor,
    hasMore,
  };
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
  }

  return mapContentRecord(record as ContentRecord);
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
  if (!exercises.length) {
    await prisma.videoLearningProgress.upsert({
      where: { userId_contentId: { userId, contentId: numericContentId } },
      update: { status: VideoLearningStatus.COMPLETED, answers: [], score: exercises.length },
      create: { userId, contentId: numericContentId, status: VideoLearningStatus.COMPLETED, answers: [], score: exercises.length },
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

  await prisma.videoLearningProgress.upsert({
    where: { userId_contentId: { userId, contentId: numericContentId } },
    update: {
      status: completed ? VideoLearningStatus.COMPLETED : VideoLearningStatus.WATCHED,
      answers,
      score: correctCount,
    },
    create: {
      userId,
      contentId: numericContentId,
      status: completed ? VideoLearningStatus.COMPLETED : VideoLearningStatus.WATCHED,
      answers,
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
  getContentById,
  submitProgress,
};
