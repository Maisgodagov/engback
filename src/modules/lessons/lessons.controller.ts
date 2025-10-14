import type { Request, Response } from 'express';

import { lessonsService } from './lessons.service';
import {
  createLessonSchema,
  lessonIdParamSchema,
  listLessonsQuerySchema,
  updateLessonSchema,
} from './lessons.schemas';

export const listLessons = async (req: Request, res: Response) => {
  const query = listLessonsQuerySchema.parse(req.query);
  const result = await lessonsService.listLessons(query);
  res.json(result);
};

export const createLesson = async (req: Request, res: Response) => {
  const payload = createLessonSchema.parse(req.body);
  const lesson = await lessonsService.createLesson(payload);
  res.status(201).json(lesson);
};

export const getLesson = async (req: Request, res: Response) => {
  const params = lessonIdParamSchema.parse(req.params);
  const lesson = await lessonsService.getLessonById(params.id);
  if (!lesson) {
    return res.status(404).json({ message: 'Lesson not found' });
  }
  res.json(lesson);
};

export const updateLesson = async (req: Request, res: Response) => {
  const params = lessonIdParamSchema.parse(req.params);
  const payload = updateLessonSchema.parse(req.body);
  const lesson = await lessonsService.updateLesson(params.id, payload);
  res.json(lesson);
};

export const deleteLesson = async (req: Request, res: Response) => {
  const params = lessonIdParamSchema.parse(req.params);
  await lessonsService.deleteLesson(params.id);
  res.status(204).end();
};
