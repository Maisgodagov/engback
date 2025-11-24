import { Request, Response } from 'express';

import { adminService } from './admin.service';

export const adminController = {
  async getWords(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const moderated = req.query.moderated as string | undefined;

      const result = await adminService.getWords(page, limit, moderated);
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
};
