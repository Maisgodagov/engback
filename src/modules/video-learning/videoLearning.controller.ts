import type { Request, Response } from 'express';

import { videoLearningService } from './videoLearning.service';
import {
  contentIdParamSchema,
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
  updateExercisesSchema,
  updateIsAdultContentSchema,
  updateModerationStatusSchema,
} from './videoLearning.schemas';

const getUserId = (req: Request): string | null => {
  const header = req.header('x-user-id');
  if (header && header.trim()) return header.trim();
  if (typeof req.query.userId === 'string' && req.query.userId.trim()) return req.query.userId.trim();
  if (typeof req.body?.userId === 'string' && req.body.userId.trim()) return req.body.userId.trim();
  return null;
};

export const getFeed = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Missing user identifier' });
    return;
  }

  // Parse pagination params
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 0;
  const cursor = req.query.cursor ? (req.query.cursor as string) : undefined;
  const cefrLevels = req.query.cefrLevels ? (req.query.cefrLevels as string) : undefined;
  const speechSpeeds = req.query.speechSpeeds ? (req.query.speechSpeeds as string) : undefined;
  const showAdultContentParam =
    typeof req.query.showAdultContent === 'string' ? (req.query.showAdultContent as string) : undefined;
  const showAdultContent =
    showAdultContentParam === undefined ? undefined : showAdultContentParam.toLowerCase() === 'true';
  const moderationFilterParam =
    typeof req.query.moderationFilter === 'string' ? (req.query.moderationFilter as string).toLowerCase() : undefined;
  const moderationFilter =
    moderationFilterParam && ['all', 'moderated', 'unmoderated'].includes(moderationFilterParam)
      ? (moderationFilterParam as 'all' | 'moderated' | 'unmoderated')
      : undefined;
  const userRole = (req.header('x-user-role') ?? '').toLowerCase();
  const isAdmin = userRole === 'admin';

  const result = await videoLearningService.getFeed(
    userId,
    limit,
    cursor,
    cefrLevels,
    speechSpeeds,
    showAdultContent,
    moderationFilter,
    isAdmin,
  );
  res.json(result);
};

export const searchPhrase = async (req: Request, res: Response) => {
  const query = phraseSearchQuerySchema.parse({
    phrase: req.query.phrase,
    limit: req.query.limit,
  });

  const result = await videoLearningService.searchPhrase(query.phrase, query.limit);
  res.json(result);
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

  // Get next content recommendation
  const feedResult = await videoLearningService.getFeed(userId, 1, params.id);
  const nextContentId = feedResult.items.length > 0 ? feedResult.items[0].id : null;

  res.json({
    result,
    nextContentId,
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
