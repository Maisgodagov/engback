import type { Request, Response } from 'express';

import { muellerService } from './mueller.service';

export const muellerController = {
  async lookup(req: Request, res: Response) {
    try {
      const { word, lang } = req.query;

      if (!word || typeof word !== 'string') {
        return res.status(400).json({ error: 'Word parameter is required' });
      }

      const normalizedLang =
        typeof lang === 'string' && lang.toLowerCase() === 'ru' ? 'ru' : 'en';
      const results = await muellerService.lookup(word, normalizedLang);
      return res.json(results);
    } catch (error) {
      console.error('Mueller lookup error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const wordId = parseInt(id, 10);

      if (isNaN(wordId)) {
        return res.status(400).json({ error: 'Invalid word ID' });
      }

      const result = await muellerService.getById(wordId);

      if (!result) {
        return res.status(404).json({ error: 'Word not found' });
      }

      return res.json(result);
    } catch (error) {
      console.error('Mueller getById error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  async getByIds(req: Request, res: Response) {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs must be an array' });
      }

      const wordIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

      const results = await muellerService.getByIds(wordIds);
      return res.json(results);
    } catch (error) {
      console.error('Mueller getByIds error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  },
};
