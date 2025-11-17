import { Router } from 'express';

import * as controller from './videoLearning.controller';
import { requireAdmin } from '../../shared/middleware/requireAdmin';

export const videoLearningRouter = Router();

videoLearningRouter.get('/feed', controller.getFeed);
videoLearningRouter.get('/search', controller.searchPhrase);
videoLearningRouter.get('/authors', requireAdmin, controller.getAuthors);
videoLearningRouter.get('/:id', controller.getContent);

videoLearningRouter.patch('/:id/moderation/cefr-level', requireAdmin, controller.updateCefrLevel);
videoLearningRouter.patch('/:id/moderation/speech-speed', requireAdmin, controller.updateSpeechSpeed);
videoLearningRouter.patch('/:id/moderation/grammar', requireAdmin, controller.updateGrammarComplexity);
videoLearningRouter.patch('/:id/moderation/vocabulary', requireAdmin, controller.updateVocabularyComplexity);
videoLearningRouter.patch('/:id/moderation/topics', requireAdmin, controller.updateTopics);
videoLearningRouter.patch('/:id/moderation/transcript', requireAdmin, controller.updateTranscriptChunks);
videoLearningRouter.patch('/:id/moderation/translation', requireAdmin, controller.updateTranslationChunks);
videoLearningRouter.patch('/:id/moderation/subtitles/chunk', requireAdmin, controller.updateSubtitleChunk);
videoLearningRouter.patch('/:id/moderation/exercises', requireAdmin, controller.updateExercises);
videoLearningRouter.patch('/:id/moderation/adult', requireAdmin, controller.updateIsAdultContent);
videoLearningRouter.patch('/:id/moderation/status', requireAdmin, controller.updateModerationStatus);
videoLearningRouter.patch('/:id/moderation/author', requireAdmin, controller.updateAuthor);
videoLearningRouter.delete('/:id', requireAdmin, controller.deleteVideo);

videoLearningRouter.post('/:id/like', controller.updateLike);
videoLearningRouter.post('/:id/progress', controller.submitProgress);
