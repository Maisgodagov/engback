import type { Request, Response } from 'express';

import { coursesService } from './courses.service';

export const list = (_req: Request, res: Response) => {
  res.json(coursesService.listCourses());
};

export const getById = (req: Request, res: Response) => {
  const course = coursesService.getCourseById(req.params.id);
  if (!course) {
    res.status(404).json({ message: 'Course not found' });
    return;
  }
  res.json(course);
};

