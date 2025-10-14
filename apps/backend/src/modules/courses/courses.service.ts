import type { CourseDto, LessonDto } from '../../shared/types';
import { randomUUID } from 'node:crypto';

const lessons = (count: number): LessonDto[] =>
  Array.from({ length: count }).map((_, index) => ({
    id: randomUUID(),
    title: `Lesson ${index + 1}`,
    durationMinutes: 10 + index * 5,
    order: index + 1,
    contentPreview: 'Vocabulary, grammar and speaking practice.',
  }));

const courses: CourseDto[] = [
  {
    id: randomUUID(),
    title: 'English Starter',
    description: 'Fundamentals of English alphabet, sounds and basic grammar.',
    level: 'Beginner',
    lessons: lessons(6),
    progress: 0,
  },
  {
    id: randomUUID(),
    title: 'Speaking Club',
    description: 'Improve fluency through guided dialogues and scenarios.',
    level: 'Intermediate',
    lessons: lessons(8),
    progress: 20,
  },
];

const listCourses = () => courses;
const getCourseById = (id: string) => courses.find((course) => course.id === id);

export const coursesService = {
  listCourses,
  getCourseById,
};
