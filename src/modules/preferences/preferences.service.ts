import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/prisma/prismaClient';

export type ThemePreference = { theme: 'light' | 'dark' };

const DEFAULT_THEME: ThemePreference = { theme: 'light' };

const ensureTable = async () => {
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id VARCHAR(191) PRIMARY KEY,
      userId VARCHAR(191) UNIQUE NOT NULL,
      theme VARCHAR(16) NOT NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )`,
  );
};

const getTheme = async (userId: string): Promise<ThemePreference> => {
  await ensureTable();
  const rows = (await prisma.$queryRawUnsafe<any[]>(
    `SELECT theme FROM user_preferences WHERE userId = ? LIMIT 1`,
    userId,
  )) as Array<{ theme: string }>;
  const theme = rows?.[0]?.theme === 'dark' ? 'dark' : 'light';
  return { theme };
};

const setTheme = async (userId: string, theme: 'light' | 'dark'): Promise<ThemePreference> => {
  await ensureTable();
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO user_preferences (id, userId, theme, createdAt, updatedAt)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE theme = VALUES(theme), updatedAt = CURRENT_TIMESTAMP(3)`,
    id,
    userId,
    theme,
  );
  return { theme };
};

export const preferencesService = {
  getTheme,
  setTheme,
};

