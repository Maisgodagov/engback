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

export const createApp = () => {
  const app = express();

  // CORS should be applied before helmet so headers are not overridden
  app.use(
    cors({
      origin: (origin, callback) => {
        // In development reflect any origin for ease of local testing
        if (!origin || process.env.NODE_ENV !== 'production') return callback(null, true);
        // In production, allow only explicit origins (comma-separated)
        const allowed = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
        if (allowed.length && origin && allowed.includes(origin)) return callback(null, true);
        // Allow Expo development URLs (exp://*.exp.direct, https://*.exp.direct, https://*.expo.dev)
        if (origin && /^exp:\/\/.*\.exp\.direct$/.test(origin)) return callback(null, true);
        if (origin && /^https:\/\/.*\.exp\.direct$/.test(origin)) return callback(null, true);
        if (origin && /^https:\/\/.*\.expo\.dev$/.test(origin)) return callback(null, true);
        if (origin === 'https://expo.dev' || origin === 'https://exp.direct') return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-user-role'],
      credentials: false,
      optionsSuccessStatus: 204,
    }),
  );
  // Extra permissive CORS for development to avoid edge cases with dev servers
  if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
      const reqOrigin = (req.headers.origin as string) || '*';
      res.header('Access-Control-Allow-Origin', reqOrigin);
      res.header('Vary', 'Origin');
      res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      const requestedHeaders =
        (req.headers['access-control-request-headers'] as string) ||
        'Content-Type, Authorization, x-user-id, x-user-role';
      res.header('Access-Control-Allow-Headers', requestedHeaders);
      // If the browser issues a preflight, answer it here
      if (req.method === 'OPTIONS') {
        if (req.headers['access-control-request-private-network'] === 'true') {
          res.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
        return res.sendStatus(204);
      }
      next();
    });
  }
  // Allow Private Network Access preflight for Chrome when calling localhost from secure origins
  app.use((req, res, next) => {
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });
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

  app.use(errorHandler);

  return app;
};

