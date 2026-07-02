import type { Request, Response } from 'express';

import { videoLearningService } from './videoLearning.service';
import {
  contentIdParamSchema,
  createTagSchema,
  tagIdParamSchema,
  updateVideoTagsSchema,
  assignAuthorTagSchema,
  submitProgressSchema,
  phraseSearchQuerySchema,
  updateLikeSchema,
  updateCefrLevelSchema,
  updateSpeechSpeedSchema,
  updateGrammarComplexitySchema,
  updateVocabularyComplexitySchema,
  updateTopicsSchema,
  updateTranscriptChunksSchema,
  updateTranslationChunksSchema,
  updateSubtitleChunkSchema,
  updateExercisesSchema,
  updateIsAdultContentSchema,
  updateModerationStatusSchema,
  updateAuthorSchema,
} from './videoLearning.schemas';

const getUserId = (req: Request): string | null => {
  if (req.user?.id) return req.user.id;
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof req.body?.userId === 'string' && req.body.userId.trim()) return req.body.userId.trim();
  return null;
};

export const getFeed = async (req: Request, res: Response) => {
  // Prevent 304 responses for dynamic feed data
  // Some clients treat 304 as empty response and show no items
  delete (req.headers as Record<string, string | undefined>)["if-none-match"];
  delete (req.headers as Record<string, string | undefined>)["if-modified-since"];
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");

  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  // Parse pagination params
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20) : 1;
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;

  const result = await videoLearningService.getFeed(
    userId,
    safeLimit,
    cursor,
  );
  res.json(result);
};

export const searchPhrase = async (req: Request, res: Response) => {
  try {
    const query = phraseSearchQuerySchema.parse({
      phrase: req.query.phrase,
      limit: req.query.limit,
      paddingSeconds: req.query.paddingSeconds,
      paddingBeforeSeconds: req.query.paddingBeforeSeconds,
      paddingAfterSeconds: req.query.paddingAfterSeconds,
    cursor: req.query.cursor,
    maxSnippets: req.query.maxSnippets,
    sampleSize: req.query.sampleSize,
  });

  const result = await videoLearningService.searchPhrase(
    query.phrase,
    query.limit,
    query.paddingSeconds,
    query.cursor,
    query.maxSnippets,
    query.sampleSize,
    query.paddingBeforeSeconds,
    query.paddingAfterSeconds,
  );
    res.json(result);
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      res.status(400).json({ message: 'Invalid phrase query' });
      return;
    }
    throw error;
  }
};

export const getContent = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const content = await videoLearningService.getContentById(params.id, userId);
  if (!content) {
    res.status(404).json({ message: 'Video learning content not found' });
    return;
  }
  res.json(content);
};

export const submitProgress = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const payload = submitProgressSchema.parse(req.body);

  const result = await videoLearningService.submitProgress(userId, params.id, payload.answers);

  // OPTIMIZATION: Removed getFeed call here (6 extra SQL queries)
  // Frontend already has the feed cached and will request next video when needed
  // This reduces response time by ~100-150ms
  res.json({
    result,
    nextContentId: null, // Frontend handles navigation from cached feed
  });
};

export const updateLike = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const payload = updateLikeSchema.parse(req.body);
  const result = await videoLearningService.updateLikeStatus(userId, params.id, payload.like);
  res.json(result);
};

export const updateCefrLevel = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateCefrLevelSchema.parse(req.body);
  const result = await videoLearningService.updateCefrLevel(params.id, body);
  res.json(result);
};

export const updateSpeechSpeed = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateSpeechSpeedSchema.parse(req.body);
  const result = await videoLearningService.updateSpeechSpeed(params.id, body);
  res.json(result);
};

export const updateGrammarComplexity = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateGrammarComplexitySchema.parse(req.body);
  const result = await videoLearningService.updateGrammarComplexity(params.id, body);
  res.json(result);
};

export const updateVocabularyComplexity = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateVocabularyComplexitySchema.parse(req.body);
  const result = await videoLearningService.updateVocabularyComplexity(params.id, body);
  res.json(result);
};

export const updateTopics = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateTopicsSchema.parse(req.body);
  const result = await videoLearningService.updateTopics(params.id, body);
  res.json(result);
};

export const updateTranscriptChunks = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateTranscriptChunksSchema.parse(req.body);
  const result = await videoLearningService.updateTranscriptChunks(params.id, body);
  res.json(result);
};

export const updateTranslationChunks = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateTranslationChunksSchema.parse(req.body);
  const result = await videoLearningService.updateTranslationChunks(params.id, body);
  res.json(result);
};

export const updateSubtitleChunk = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateSubtitleChunkSchema.parse(req.body);
  const result = await videoLearningService.updateSubtitleChunk(params.id, body);
  res.json(result);
};

export const updateExercises = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateExercisesSchema.parse(req.body);
  const result = await videoLearningService.updateExercises(params.id, body);
  res.json(result);
};

export const updateIsAdultContent = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateIsAdultContentSchema.parse(req.body);
  const result = await videoLearningService.updateIsAdultContent(params.id, body);
  res.json(result);
};

export const updateModerationStatus = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateModerationStatusSchema.parse(req.body);
  const result = await videoLearningService.updateModerationStatus(params.id, body);
  res.json(result);
};

export const deleteVideo = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  await videoLearningService.deleteVideo(params.id);
  res.status(204).send();
};

export const getAuthors = async (req: Request, res: Response) => {
  // Check admin role
  const userRole = (req.header('x-user-role') ?? '').toLowerCase();
  if (userRole !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  
  const authors = await videoLearningService.getAuthors();
  res.json(authors);
};

export const updateAuthor = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateAuthorSchema.parse(req.body);
  const result = await videoLearningService.updateAuthor(params.id, body.author);
  res.json(result);
};

export const getTagSummary = async (_req: Request, res: Response) => {
  const result = await videoLearningService.getTagSummary();
  res.json(result);
};

export const createTag = async (req: Request, res: Response) => {
  const body = createTagSchema.parse(req.body);
  const result = await videoLearningService.createTag(body.name);
  res.status(201).json(result);
};

export const deleteTag = async (req: Request, res: Response) => {
  const params = tagIdParamSchema.parse({ tagId: req.params.tagId });
  await videoLearningService.deleteTag(params.tagId);
  res.status(204).send();
};

export const updateVideoTags = async (req: Request, res: Response) => {
  const params = contentIdParamSchema.parse({ id: req.params.id });
  const body = updateVideoTagsSchema.parse(req.body);
  const result = await videoLearningService.updateVideoTags(params.id, body.tagIds);
  res.json(result);
};

export const assignTagToAuthorVideos = async (req: Request, res: Response) => {
  const body = assignAuthorTagSchema.parse(req.body);
  const result = await videoLearningService.assignTagToAuthorVideos(body.author, body.tagId);
  res.json(result);
};
