import { Request, Response } from 'express';

import { lessonsService } from './lessons.service';

export const lessonsController = {
  async list(req: Request, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const offset = parseInt(req.query.offset as string, 10) || 0;
      const lessons = await lessonsService.listLessons(limit, offset);
      res.json({ lessons });
    } catch (error) {
      console.error('[LESSONS] Error listing lessons', error);
      res.status(500).json({ message: 'Failed to list lessons' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ message: 'Invalid lesson id' });
        return;
      }

      const { lesson, exercises } = await lessonsService.getLessonById(id);
      if (!lesson) {
        res.status(404).json({ message: 'Lesson not found' });
        return;
      }

      res.json({ lesson, exercises });
    } catch (error) {
      console.error('[LESSONS] Error getting lesson', error);
      res.status(500).json({ message: 'Failed to get lesson' });
    }
  },
};

