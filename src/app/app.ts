import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { authMiddleware, requireAuth } from '../shared/middleware/auth';
import { errorHandler } from '../shared/middleware/errorHandler';
import { authRouter } from '../modules/auth/auth.router';
import { usersRouter } from '../modules/users/users.router';
import { dictionaryRouter } from '../modules/dictionary/dictionary.router';
import { adminRouter } from '../modules/admin/admin.router';
import { videoLearningRouter } from '../modules/video-learning/videoLearning.router';
import { exercisesRouter } from '../modules/exercises/exercises.router';
import { muellerRouter } from '../modules/mueller/mueller.router';
import { gameSnippetsRouter } from '../modules/game-snippets/gameSnippets.router';
import { publicGameSnippetsRouter } from '../modules/game-snippets/publicGameSnippets.router';
import { readingRouter } from '../modules/reading/reading.router';
import { shareRouter } from '../modules/share/share.router';
import { shareApiRouter } from '../modules/share/share.api.router';

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
  app.use(authMiddleware);
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', requireAuth);
  app.use('/api/users', usersRouter);
  app.use('/api/dictionary', dictionaryRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/video-learning', videoLearningRouter);
  app.use('/api/exercises', exercisesRouter);
  app.use('/api/mueller', muellerRouter);
  app.use('/api/admin/game-snippets', gameSnippetsRouter);
  app.use('/api/game-snippets', publicGameSnippetsRouter);
  app.use('/api/reading', readingRouter);
  app.use('/api/share', shareApiRouter);
  app.use('/share', shareRouter);
  
  app.use(errorHandler);

  return app;
};

