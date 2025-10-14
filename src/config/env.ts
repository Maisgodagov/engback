import 'dotenv/config';

export interface Environment {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl?: string;
  jwtSecret?: string;
}

const DEFAULT_PORT = 3001;

export const env: Environment = {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  nodeEnv: (process.env.NODE_ENV as Environment['nodeEnv']) ?? 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
};

