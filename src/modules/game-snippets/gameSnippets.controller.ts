import type { Request, Response } from 'express';

import { createGameSnippetSchema, updateGameSnippetSchema } from './gameSnippets.schemas';
import { gameSnippetsService } from './gameSnippets.service';

export const gameSnippetsController = {
  listActive: async (req: Request, res: Response) => {
    const rawLimit = req.query.limit ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(rawLimit) ? Math.floor(rawLimit as number) : undefined;
    const items = await gameSnippetsService.listActive(limit);
    res.json({ items });
  },

  list: async (req: Request, res: Response) => {
    const approvedParam = req.query.approved;
    const approved =
      approvedParam === undefined
        ? undefined
        : String(approvedParam).toLowerCase() === 'true';
    const items = await gameSnippetsService.list({ isApproved: approved });
    res.json({ items });
  },

  create: async (req: Request, res: Response) => {
    const payload = createGameSnippetSchema.parse(req.body);
    if (payload.endSeconds <= payload.startSeconds) {
      res.status(400).json({ message: 'endSeconds must be greater than startSeconds' });
      return;
    }
    const item = await gameSnippetsService.create(payload);
    res.status(201).json(item);
  },

  update: async (req: Request, res: Response) => {
    const id = req.params.id;
    const payload = updateGameSnippetSchema.parse(req.body);
    if (
      typeof payload.startSeconds === 'number' &&
      typeof payload.endSeconds === 'number' &&
      payload.endSeconds <= payload.startSeconds
    ) {
      res.status(400).json({ message: 'endSeconds must be greater than startSeconds' });
      return;
    }
    const item = await gameSnippetsService.update(id, payload);
    res.json(item);
  },

  remove: async (req: Request, res: Response) => {
    const id = req.params.id;
    await gameSnippetsService.remove(id);
    res.status(204).send();
  },
};
