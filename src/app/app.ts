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
import { lessonsRouter } from '../modules/lessons/lessons.router';
import { adminRouter } from '../modules/admin/admin.router';
import { videoLearningRouter } from '../modules/video-learning/videoLearning.router';
import { exercisesRouter } from '../modules/exercises/exercises.router';
import { muellerRouter } from '../modules/mueller/mueller.router';

export const createApp = () => {
  const app = express();

  // CORS should be applied before helmet so headers are not overridden
  // OPTIMIZATION: Simplified CORS - one middleware instead of 3 for better performance
  const corsOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: process.env.NODE_ENV === 'production'
        ? corsOrigins.length > 0
          ? corsOrigins
          : false // Block all in production if no CORS_ORIGIN set
        : true, // Allow all origins in development
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role'],
      credentials: false,
      optionsSuccessStatus: 204,
    }),
  );
  // Apply helmet after CORS. Relax some policies in dev to avoid interfering with localhost API calls
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: process.env.NODE_ENV === 'production',
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
  app.use('/api/lessons', lessonsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/video-learning', videoLearningRouter);
  app.use('/api/exercises', exercisesRouter);
  app.use('/api/mueller', muellerRouter);

  app.use(errorHandler);

  return app;
};

