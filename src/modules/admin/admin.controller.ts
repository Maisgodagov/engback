import { Request, Response } from 'express';

import { adminService } from './admin.service';

export const adminController = {
  async getUsers(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      const result = await adminService.getUsers(page, limit);
      res.json(result);
    } catch (error) {
      console.error('[ADMIN] Error getting users:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  },

  async updateUserRole(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      await adminService.updateUserRole(id, role);
      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] Error updating user role:', error);
      res.status(500).json({ error: 'Failed to update user role' });
    }
  },

  async getWords(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const moderated = req.query.moderated as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await adminService.getWords(page, limit, moderated, search);
      res.json(result);
    } catch (error) {
      console.error('[ADMIN] Error getting words:', error);
      res.status(500).json({ error: 'Failed to get words' });
    }
  },

  async updateWord(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { word, partOfSpeech, translations } = req.body;

      await adminService.updateWord(
        parseInt(id),
        word,
        partOfSpeech,
        translations,
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] Error updating word:', error);
      res.status(500).json({ error: 'Failed to update word' });
    }
  },

  async deleteWord(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await adminService.deleteWord(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] Error deleting word:', error);
      res.status(500).json({ error: 'Failed to delete word' });
    }
  },

  async moderateWord(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { moderated } = req.body;

      await adminService.moderateWord(parseInt(id), moderated);
      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] Error moderating word:', error);
      res.status(500).json({ error: 'Failed to moderate word' });
    }
  },

  // Precomputed exercises
  async getPrecomputed(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const moderated = req.query.moderated as string | undefined;
      const search = req.query.search as string | undefined;

      const result = await adminService.getPrecomputedExercises(page, limit, moderated, search);
      res.json(result);
    } catch (error) {
      console.error('[ADMIN] Error getting precomputed exercises:', error);
      res.status(500).json({ error: 'Failed to get precomputed exercises' });
    }
  },

  async updatePrecomputed(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { prompt, correctAnswer, options, translations, partOfSpeech } = req.body;

      await adminService.updatePrecomputedExercise(
        parseInt(id),
        prompt,
        correctAnswer,
        options,
        translations,
        partOfSpeech,
      );

      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] Error updating precomputed exercise:', error);
      res.status(500).json({ error: 'Failed to update precomputed exercise' });
    }
  },

  async deletePrecomputed(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await adminService.deletePrecomputedExercise(parseInt(id));
      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] Error deleting precomputed exercise:', error);
      res.status(500).json({ error: 'Failed to delete precomputed exercise' });
    }
  },

  async moderatePrecomputed(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { moderated } = req.body;

      await adminService.moderatePrecomputedExercise(parseInt(id), moderated);
      res.json({ success: true });
    } catch (error) {
      console.error('[ADMIN] Error moderating precomputed exercise:', error);
      res.status(500).json({ error: 'Failed to moderate precomputed exercise' });
    }
  },
};
