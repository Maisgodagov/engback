import { prisma } from '../../shared/prisma/prismaClient';
import type {
  LessonProgressStatus,
  RoadmapLessonDto,
  RoadmapModuleDto,
} from '../../shared/types';
import { LessonProgressStatus as LessonProgressStatusEnum } from '../../shared/types';
import { DEFAULT_ROADMAP, seedModuleToCreateInput } from './roadmap.constants';

type LearningPathModuleClient = {
  count: () => Promise<number>;
  create: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<
    Array<{
      id: string;
      title: string;
      description: string | null;
      icon: string | null;
      theme: string | null;
      order: number;
      lessons: Array<{
        id: string;
        title: string;
        description: string | null;
        icon: string | null;
        xpReward: number;
        order: number;
        difficulty: number;
        skill: string | null;
        moduleId?: string;
      }>;
    }>
  >;
};

type LearningPathLessonClient = {
  findUnique: (args: unknown) => Promise<{ id: string } | null>;
};

type LearningPathLessonProgressClient = {
  findMany: (args: unknown) => Promise<
    Array<{
      lessonId: string;
      status: string;
      stars: number;
    }>
  >;
  upsert: (args: unknown) => Promise<unknown>;
};

const getLearningPathModuleClient = (): LearningPathModuleClient | undefined =>
  (prisma as unknown as { learningPathModule?: LearningPathModuleClient }).learningPathModule;

const getLearningPathLessonClient = (): LearningPathLessonClient | undefined =>
  (prisma as unknown as { learningPathLesson?: LearningPathLessonClient }).learningPathLesson;

const getLearningPathProgressClient = (): LearningPathLessonProgressClient | undefined =>
  (prisma as unknown as { learningPathLessonProgress?: LearningPathLessonProgressClient })
    .learningPathLessonProgress;

const isLessonProgressStatus = (value: unknown): value is LessonProgressStatus => {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(LessonProgressStatusEnum, value as LessonProgressStatus)
  );
};

const ensureDefaultRoadmapSeeded = async () => {
  const moduleClient = getLearningPathModuleClient();
  if (!moduleClient) return;

  const moduleCount = await moduleClient.count();
  if (moduleCount > 0) return;

  for (const moduleConfig of DEFAULT_ROADMAP) {
    await moduleClient.create({
      data: seedModuleToCreateInput(moduleConfig),
    });
  }
};

const clampStars = (stars?: number) => {
  if (typeof stars !== 'number' || Number.isNaN(stars)) return 0;
  return Math.max(0, Math.min(3, Math.floor(stars)));
};

const normalizeStatus = (status: LessonProgressStatus | undefined) => {
  if (!status) return LessonProgressStatusEnum.LOCKED;
  return status;
};

const buildFallbackRoadmap = (): RoadmapModuleDto[] => {
  let currentAssigned = false;

  return DEFAULT_ROADMAP.map((moduleConfig, moduleIndex) => {
    const lessons: RoadmapLessonDto[] = moduleConfig.lessons.map((lessonConfig, lessonIndex) => {
      const shouldBeCurrent = !currentAssigned;
      const status = shouldBeCurrent
        ? LessonProgressStatusEnum.AVAILABLE
        : LessonProgressStatusEnum.LOCKED;
      const isCurrent = shouldBeCurrent;
      if (shouldBeCurrent) currentAssigned = true;

      return {
        id: `default-module-${moduleIndex + 1}-lesson-${lessonIndex + 1}`,
        moduleId: `default-module-${moduleIndex + 1}`,
        title: lessonConfig.title,
        description: lessonConfig.description,
        icon: lessonConfig.icon,
        xpReward: lessonConfig.xpReward ?? 15,
        order: lessonConfig.order,
        difficulty: lessonConfig.difficulty ?? 1,
        skill: lessonConfig.skill,
        status,
        stars: 0,
        isCurrent,
      };
    });

    return {
      id: `default-module-${moduleIndex + 1}`,
      title: moduleConfig.title,
      description: moduleConfig.description,
      icon: moduleConfig.icon,
      theme: moduleConfig.theme,
      order: moduleConfig.order,
      lessons,
    };
  });
};

const applyFallbackProgress = (
  modules: RoadmapModuleDto[],
  lessonId: string,
  status: LessonProgressStatus,
  stars?: number,
) => {
  const flattened: RoadmapLessonDto[] = [];
  modules.forEach((module) => {
    module.lessons.forEach((lesson) => {
      flattened.push(lesson);
    });
  });

  const targetIndex = flattened.findIndex((lesson) => lesson.id === lessonId);
  if (targetIndex === -1) {
    throw Object.assign(new Error('Lesson not found'), { status: 404 });
  }

  const targetLesson = flattened[targetIndex];
  targetLesson.status = status;
  targetLesson.stars = clampStars(stars);
  targetLesson.isCurrent =
    status === LessonProgressStatusEnum.IN_PROGRESS || status === LessonProgressStatusEnum.AVAILABLE;

  if (status === LessonProgressStatusEnum.COMPLETED) {
    targetLesson.isCurrent = false;
    const nextLesson = flattened[targetIndex + 1];
    if (nextLesson) {
      nextLesson.status = LessonProgressStatusEnum.AVAILABLE;
      nextLesson.isCurrent = true;
    }
  }

  if (!flattened.some((lesson) => lesson.isCurrent)) {
    const nextCandidate =
      flattened.find((lesson) => lesson.status === LessonProgressStatusEnum.IN_PROGRESS) ||
      flattened.find((lesson) => lesson.status === LessonProgressStatusEnum.AVAILABLE) ||
      flattened.find((lesson) => lesson.status === LessonProgressStatusEnum.LOCKED);

    if (nextCandidate) {
      if (nextCandidate.status === LessonProgressStatusEnum.LOCKED) {
        nextCandidate.status = LessonProgressStatusEnum.AVAILABLE;
      }
      nextCandidate.isCurrent = true;
    }
  }

  return modules;
};

const getRoadmapForUser = async (userId?: string | null): Promise<RoadmapModuleDto[]> => {
  await ensureDefaultRoadmapSeeded();

  const moduleClient = getLearningPathModuleClient();
  const progressClient = getLearningPathProgressClient();

  if (!moduleClient || !progressClient) {
    return buildFallbackRoadmap();
  }

  const modules = await moduleClient.findMany({
    orderBy: { order: 'asc' },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
      },
    },
  });

  const progressList = userId
    ? await progressClient.findMany({
        where: { userId },
      })
    : [];

  const progressMap = new Map(
    progressList.map((item) => [
      item.lessonId,
      {
        status: item.status as LessonProgressStatus,
        stars: item.stars,
      },
    ]),
  );

  let nextUnlocked = true;
  let currentMarked = false;

  const resolvedModules: RoadmapModuleDto[] = [];

  for (const module of modules) {
    const lessons: RoadmapLessonDto[] = [];

    for (const lesson of module.lessons) {
      const progress = progressMap.get(lesson.id);
      let status = normalizeStatus(progress?.status);
      let stars = progress?.stars ?? 0;

      if (!progress) {
        status = nextUnlocked ? LessonProgressStatusEnum.AVAILABLE : LessonProgressStatusEnum.LOCKED;
        stars = 0;
      }

      let isCurrent = false;
      if (status === LessonProgressStatusEnum.COMPLETED) {
        nextUnlocked = true;
      } else if (status === LessonProgressStatusEnum.IN_PROGRESS) {
        nextUnlocked = false;
        if (!currentMarked) {
          isCurrent = true;
          currentMarked = true;
        } else {
          isCurrent = false;
        }
      } else if (status === LessonProgressStatusEnum.AVAILABLE) {
        nextUnlocked = false;
        if (!currentMarked) {
          isCurrent = true;
          currentMarked = true;
        }
      } else {
        // LOCKED
        nextUnlocked = false;
      }

      lessons.push({
        id: lesson.id,
        moduleId: module.id,
        title: lesson.title,
        description: lesson.description ?? undefined,
        icon: lesson.icon ?? undefined,
        xpReward: lesson.xpReward,
        order: lesson.order,
        difficulty: lesson.difficulty,
        skill: lesson.skill ?? undefined,
        status,
        stars,
        isCurrent,
      });
    }

    resolvedModules.push({
      id: module.id,
      title: module.title,
      description: module.description ?? undefined,
      icon: module.icon ?? undefined,
      theme: module.theme ?? undefined,
      order: module.order,
      lessons,
    });
  }

  // Если пользователь не имеет IN_PROGRESS, отметим первый AVAILABLE как текущий
  if (!currentMarked) {
    for (const module of resolvedModules) {
      const availableLesson = module.lessons.find((lesson) => lesson.status === LessonProgressStatusEnum.AVAILABLE);
      if (availableLesson) {
        availableLesson.isCurrent = true;
        break;
      }
    }
  }

  return resolvedModules;
};

const updateLessonProgress = async (
  userId: string,
  lessonId: string,
  status: LessonProgressStatus,
    stars?: number,
) => {
  if (!isLessonProgressStatus(status)) {
    throw Object.assign(new Error('Invalid lesson status'), { status: 400 });
  }

  await ensureDefaultRoadmapSeeded();

  const moduleClient = getLearningPathModuleClient();
  const lessonClient = getLearningPathLessonClient();
  const progressClient = getLearningPathProgressClient();

  if (!moduleClient || !lessonClient || !progressClient) {
    const fallback = buildFallbackRoadmap();
    return applyFallbackProgress(fallback, lessonId, status, stars);
  }

  const lesson = await lessonClient.findUnique({ where: { id: lessonId } });
  if (!lesson) {
    throw Object.assign(new Error('Lesson not found'), { status: 404 });
  }

  const normalizedStars = clampStars(stars);
  const now = new Date();

  await progressClient.upsert({
    where: {
      userId_lessonId: {
        userId,
        lessonId,
      },
    },
    create: {
      userId,
      lessonId,
      status,
      stars: normalizedStars,
      completedAt: status === LessonProgressStatusEnum.COMPLETED ? now : null,
    },
    update: {
      status,
      stars: normalizedStars,
      completedAt: status === LessonProgressStatusEnum.COMPLETED ? now : null,
      updatedAt: now,
    },
  });

  return getRoadmapForUser(userId);
};

export const roadmapService = {
  getRoadmapForUser,
  updateLessonProgress,
};
