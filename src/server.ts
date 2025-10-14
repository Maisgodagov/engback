import { createServer } from 'http';

import { createApp } from './app/app';
import { env } from './config/env';

const app = createApp();
const server = createServer(app);

const PORT = env.port;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`проверка d Backend API listening on http://0.0.0.0:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
  console.log(`Network access: http://192.168.1.120:${PORT}`);
  console.log(`🚀 Production deployment test - ${new Date().toISOString()}`);
});

