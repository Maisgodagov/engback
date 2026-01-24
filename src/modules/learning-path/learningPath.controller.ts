import { type Request, type Response } from 'express';
import {
  createLearningPathLessonSchema,
  createLearningPathModuleSchema,
  importLearningPathSnippetSchema,
  lessonProgressStepSchema,
  updateLearningPathLessonSchema,
  updateLearningPathModuleSchema,
} from './learningPath.schemas';
import { learningPathService } from './learningPath.service';
import { videoLearningService } from '../video-learning/videoLearning.service';

const getUserId = (req: Request) => {
  const userId = req.headers['x-user-id'];
  return typeof userId === 'string' && userId.trim().length ? userId.trim() : null;
};

export const learningPathController = {
  listPath: async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const modules = await learningPathService.listPathForUser(userId);
      res.json({ modules });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to list path', error);
      res.status(500).json({ message: 'Failed to load path' });
    }
  },

  getLesson: async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const lesson = await learningPathService.getLessonForUser(id, userId);
      if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
      }
      res.json({ lesson });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to load lesson', error);
      res.status(500).json({ message: 'Failed to load lesson' });
    }
  },

  startLesson: async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User id is required' });
    }
    const { id } = req.params;
    const parseResult = lessonProgressStepSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const progress = await learningPathService.startLesson(id, userId, parseResult.data.lastStepIndex);
      res.json({ progress });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to start lesson', error);
      res.status(500).json({ message: 'Failed to start lesson' });
    }
  },

  updateLessonStep: async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User id is required' });
    }
    const { id } = req.params;
    const parseResult = lessonProgressStepSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const progress = await learningPathService.updateLessonStep(id, userId, parseResult.data.lastStepIndex);
      res.json({ progress });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to update lesson progress', error);
      res.status(500).json({ message: 'Failed to update lesson progress' });
    }
  },

  completeLesson: async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: 'User id is required' });
    }
    const { id } = req.params;
    const parseResult = lessonProgressStepSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const result = await learningPathService.completeLesson(id, userId, parseResult.data.lastStepIndex);
      res.json(result);
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to complete lesson', error);
      res.status(500).json({ message: 'Failed to complete lesson' });
    }
  },

  listModulesAdmin: async (_req: Request, res: Response) => {
    try {
      const modules = await learningPathService.listModulesAdmin();
      res.json({ modules });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to list modules', error);
      res.status(500).json({ message: 'Failed to load modules' });
    }
  },

  createModule: async (req: Request, res: Response) => {
    const parseResult = createLearningPathModuleSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const module = await learningPathService.createModule(parseResult.data);
      res.status(201).json({ module });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to create module', error);
      res.status(500).json({ message: 'Failed to create module' });
    }
  },

  updateModule: async (req: Request, res: Response) => {
    const parseResult = updateLearningPathModuleSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const module = await learningPathService.updateModule(req.params.id, parseResult.data);
      res.json({ module });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to update module', error);
      res.status(500).json({ message: 'Failed to update module' });
    }
  },

  removeModule: async (req: Request, res: Response) => {
    try {
      await learningPathService.removeModule(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to remove module', error);
      res.status(500).json({ message: 'Failed to remove module' });
    }
  },

  listLessonsAdmin: async (req: Request, res: Response) => {
    try {
      const moduleId = typeof req.query.moduleId === 'string' ? req.query.moduleId : undefined;
      const lessons = await learningPathService.listLessonsAdmin(moduleId);
      res.json({ lessons });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to list lessons', error);
      res.status(500).json({ message: 'Failed to load lessons' });
    }
  },

  getLessonAdmin: async (req: Request, res: Response) => {
    try {
      const lesson = await learningPathService.getLessonAdmin(req.params.id);
      if (!lesson) {
        return res.status(404).json({ message: 'Lesson not found' });
      }
      res.json({ lesson });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to load lesson', error);
      res.status(500).json({ message: 'Failed to load lesson' });
    }
  },

  createLesson: async (req: Request, res: Response) => {
    const parseResult = createLearningPathLessonSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const lesson = await learningPathService.createLesson(parseResult.data);
      res.status(201).json({ lesson });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to create lesson', error);
      res.status(500).json({ message: 'Failed to create lesson' });
    }
  },

  updateLesson: async (req: Request, res: Response) => {
    const parseResult = updateLearningPathLessonSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const lesson = await learningPathService.updateLesson(req.params.id, parseResult.data);
      res.json({ lesson });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to update lesson', error);
      res.status(500).json({ message: 'Failed to update lesson' });
    }
  },

  removeLesson: async (req: Request, res: Response) => {
    try {
      await learningPathService.removeLesson(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to remove lesson', error);
      res.status(500).json({ message: 'Failed to remove lesson' });
    }
  },

  searchSnippets: async (req: Request, res: Response) => {
    try {
      const query = typeof req.query.query === 'string' ? req.query.query : '';
      if (!query.trim()) {
        return res.json({ snippets: [] });
      }
      const result = await videoLearningService.searchPhrase(query.trim(), 25, 1, undefined, 60);
      const snippets = result.items.map((item) => ({
        id: item.id,
        phrase: item.phrase,
        translation: item.translationMatchedText ?? null,
        contentId: Number(item.contentId),
        startSeconds: item.startSeconds,
        endSeconds: item.endSeconds,
        videoUrl: item.videoUrl ?? null,
        videoName: item.videoName ?? null,
      }));
      res.json({ snippets });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to search snippets', error);
      res.status(500).json({ message: 'Failed to search snippets' });
    }
  },

  importSnippet: async (req: Request, res: Response) => {
    const parseResult = importLearningPathSnippetSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    try {
      const snippet = await learningPathService.importSnippet(parseResult.data);
      res.json({ snippet });
    } catch (error) {
      console.error('[LEARNING_PATH] Failed to import snippet', error);
      res.status(500).json({ message: 'Failed to import snippet' });
    }
  },
};
