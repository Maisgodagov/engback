import type { Request, Response } from 'express';

import { LessonProgressStatus } from '../../shared/types';
import { roadmapService } from './roadmap.service';

const getUserId = (req: Request): string | null => {
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof (req.body as any)?.userId === 'string' && (req.body as any).userId.trim()) {
    return (req.body as any).userId.trim();
  }
  return null;
};

export const list = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const roadmap = await roadmapService.getRoadmapForUser(userId);
  res.json({
    modules: roadmap,
  });
};

export const updateLessonStatus = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  const { status, stars } = req.body as { status: LessonProgressStatus; stars?: number };
  if (!status || typeof status !== 'string') {
    res.status(400).json({ message: 'status is required' });
    return;
  }
  const lessonId = req.params.lessonId;
  if (!lessonId) {
    res.status(400).json({ message: 'Lesson identifier is required' });
    return;
  }

  const roadmap = await roadmapService.updateLessonProgress(userId, lessonId, status, stars);
  res.json({
    modules: roadmap,
  });
};
