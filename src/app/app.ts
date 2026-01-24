import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { errorHandler } from '../shared/middleware/errorHandler';
import { authRouter } from '../modules/auth/auth.router';
import { coursesRouter } from '../modules/courses/courses.router';
import { usersRouter } from '../modules/users/users.router';
import { dictionaryRouter } from '../modules/dictionary/dictionary.router';
import { preferencesRouter } from '../modules/preferences/preferences.router';
import { roadmapRouter } from '../modules/roadmap/roadmap.router';
import { adminRouter } from '../modules/admin/admin.router';
import { videoLearningRouter } from '../modules/video-learning/videoLearning.router';
import { exercisesRouter } from '../modules/exercises/exercises.router';
import { muellerRouter } from '../modules/mueller/mueller.router';
import { gameSnippetsRouter } from '../modules/game-snippets/gameSnippets.router';
import { publicGameSnippetsRouter } from '../modules/game-snippets/publicGameSnippets.router';
import { audioPhraseLevelsAdminRouter } from '../modules/audio-phrase-levels/audioPhraseLevels.admin.router';
import { audioPhraseLevelsPublicRouter } from '../modules/audio-phrase-levels/audioPhraseLevels.public.router';
import { learningPathRouter } from '../modules/learning-path/learningPath.router';
import { learningPathAdminRouter } from '../modules/learning-path/learningPath.admin.router';

export const createApp = () => {
  const app = express();

  // CORS should be applied before helmet so headers are not overridden
  // OPTIMIZATION: Simplified CORS - one middleware instead of 3 for better performance
  const defaultAllowedOrigins = ['https://app.slothary.ru', 'http://localhost:5173', 'http://localhost:5174'];
  const corsOrigins = Array.from(
    new Set(
      (process.env.CORS_ORIGIN || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .concat(defaultAllowedOrigins),
    ),
  );

  app.use(
    cors({
      origin: process.env.NODE_ENV === 'production' ? corsOrigins : true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role'],
      credentials: false,
      optionsSuccessStatus: 204,
    }),
  );
  // Apply helmet after CORS. Relax some policies in dev to avoid interfering with localhost API calls
  app.use(
    helmet({
      contentSecurityPolicy: false, // API-only service, avoid blocking cross-origin fetches
      crossOriginEmbedderPolicy: false, // allow cross-origin resource loading (needed for CORS)
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // Ensure preflight succeeds for any route
  app.options('*', cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/courses', coursesRouter);
  app.use('/api/dictionary', dictionaryRouter);
  app.use('/api/preferences', preferencesRouter);
  app.use('/api/roadmap', roadmapRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/video-learning', videoLearningRouter);
  app.use('/api/exercises', exercisesRouter);
  app.use('/api/mueller', muellerRouter);
  app.use('/api/admin/game-snippets', gameSnippetsRouter);
  app.use('/api/admin/audio-phrase-levels', audioPhraseLevelsAdminRouter);
  app.use('/api/admin/learning-path', learningPathAdminRouter);
  app.use('/api/game-snippets', publicGameSnippetsRouter);
  app.use('/api/audio-phrase-levels', audioPhraseLevelsPublicRouter);
  app.use('/api/learning-path', learningPathRouter);
  
  app.use(errorHandler);

  return app;
};

