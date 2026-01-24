import type { Request, Response } from 'express';

import {
  createAudioPhraseLevelSchema,
  recordAudioPhraseProgressSchema,
  updateAudioPhraseLevelSchema,
} from './audioPhraseLevels.schemas';
import { audioPhraseLevelsService } from './audioPhraseLevels.service';

export const audioPhraseLevelsController = {
  listAdmin: async (_req: Request, res: Response) => {
    const items = await audioPhraseLevelsService.listAdmin();
    res.json({ items });
  },

  listPublic: async (req: Request, res: Response) => {
    const userId = req.header('x-user-id') ?? undefined;
    const items = await audioPhraseLevelsService.listPublic(userId);
    res.json({ items });
  },

  getByIdAdmin: async (req: Request, res: Response) => {
    const id = req.params.id;
    const item = await audioPhraseLevelsService.getByIdAdmin(id);
    if (!item) {
      res.status(404).json({ message: 'Level not found' });
      return;
    }
    res.json(item);
  },

  getByIdPublic: async (req: Request, res: Response) => {
    const id = req.params.id;
    const item = await audioPhraseLevelsService.getByIdPublic(id);
    if (!item) {
      res.status(404).json({ message: 'Level not found' });
      return;
    }
    res.json(item);
  },

  create: async (req: Request, res: Response) => {
    const payload = createAudioPhraseLevelSchema.parse(req.body);
    const item = await audioPhraseLevelsService.create(payload);
    res.status(201).json(item);
  },

  update: async (req: Request, res: Response) => {
    const id = req.params.id;
    const payload = updateAudioPhraseLevelSchema.parse(req.body);
    const item = await audioPhraseLevelsService.update(id, payload);
    res.json(item);
  },

  remove: async (req: Request, res: Response) => {
    const id = req.params.id;
    await audioPhraseLevelsService.remove(id);
    res.status(204).send();
  },

  listSnippets: async (_req: Request, res: Response) => {
    const items = await audioPhraseLevelsService.listApprovedSnippetsWithLevels();
    res.json({ items });
  },

  recordProgress: async (req: Request, res: Response) => {
    const userId = req.header('x-user-id');
    if (!userId) {
      res.status(401).json({ message: 'Missing user id' });
      return;
    }
    const levelId = req.params.id;
    const payload = recordAudioPhraseProgressSchema.parse(req.body);
    const result = await audioPhraseLevelsService.recordProgress(userId, levelId, payload);
    res.json(result);
  },
};
