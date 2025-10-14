import { prisma } from '../../shared/prisma/prismaClient';
import type {
  AdminCatalogDto,
  AdminCourseDto,
  AdminModuleDto,
} from '../../shared/types';
import { lessonsService } from '../lessons/lessons.service';

const parseDifficultyLevels = (value?: string | null) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const listCourses = async (): Promise<AdminCourseDto[]> => {
  const records = await prisma.course.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      modules: {
        orderBy: { order: 'asc' },
        include: {
          module: {
            include: {
              lessons: true,
            },
          },
        },
      },
    },
  });

  return records.map((course) => ({
    id: course.id,
    title: course.title,
    description: course.description ?? undefined,
    imageUrl: course.imageUrl ?? undefined,
    price: course.price?.toString() ?? '0',
    difficultyLevels: parseDifficultyLevels(course.difficultyLevels),
    isPublished: course.isPublished,
    modules: course.modules.map((courseModule) => ({
      id: courseModule.module.id,
      title: courseModule.module.title,
      description: courseModule.module.description ?? undefined,
      order: courseModule.order,
      lessonCount: courseModule.module.lessons.length,
    })),
    updatedAt: course.updatedAt.toISOString(),
  }));
};

const listModules = async (): Promise<AdminModuleDto[]> => {
  const records = await prisma.module.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      lessons: {
        orderBy: { order: 'asc' },
        include: {
          lesson: true,
        },
      },
      courses: {
        orderBy: { order: 'asc' },
        include: {
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
  });

  return records.map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description ?? undefined,
    imageUrl: module.imageUrl ?? undefined,
    lessons: module.lessons.map((moduleLesson) => ({
      id: moduleLesson.lesson.id,
      title: moduleLesson.lesson.title,
      order: moduleLesson.order,
      xpReward: moduleLesson.lesson.xpReward,
    })),
    courses: module.courses
      .filter((courseLink) => courseLink.course)
      .map((courseLink) => ({
        id: courseLink.course.id,
        title: courseLink.course.title,
        order: courseLink.order,
      })),
    updatedAt: module.updatedAt.toISOString(),
  }));
};

const getCatalog = async (): Promise<AdminCatalogDto> => {
  const [courses, modules, lessonsResult] = await Promise.all([
    listCourses(),
    listModules(),
    lessonsService.listLessons({ limit: 500 }),
  ]);

  return {
    courses,
    modules,
    lessons: lessonsResult.items,
  };
};

export const adminService = {
  listCourses,
  listModules,
  getCatalog,
};
