import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/prisma/prismaClient';

export type ThemePreference = { theme: 'light' | 'dark' };

const DEFAULT_THEME: ThemePreference = { theme: 'light' };

// OPTIMIZATION: Cache to avoid CREATE TABLE IF NOT EXISTS on every request
let tableChecked = false;

const ensureTable = async () => {
  if (tableChecked) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS user_preferences (
      id VARCHAR(191) PRIMARY KEY,
      userId VARCHAR(191) UNIQUE NOT NULL,
      theme VARCHAR(16) NOT NULL,
      reader_font_size INT NOT NULL DEFAULT 18,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )`,
  );
  tableChecked = true;
};

const getTheme = async (userId: string): Promise<ThemePreference> => {
  // OPTIMIZATION: Check table once, not on every request
  if (!tableChecked) {
    await ensureTable();
  }

  // OPTIMIZATION: Use Prisma ORM instead of raw SQL (table already in schema.prisma)
  const preference = await prisma.userPreference.findUnique({
    where: { userId },
    select: { theme: true },
  });

  const theme = preference?.theme === 'dark' ? 'dark' : 'light';
  return { theme };
};

const setTheme = async (userId: string, theme: 'light' | 'dark'): Promise<ThemePreference> => {
  // OPTIMIZATION: Check table once, not on every request
  if (!tableChecked) {
    await ensureTable();
  }

  // OPTIMIZATION: Use Prisma upsert instead of raw SQL
  await prisma.userPreference.upsert({
    where: { userId },
    update: { theme },
    create: {
      id: randomUUID(),
      userId,
      theme,
    },
  });

  return { theme };
};

export const preferencesService = {
  getTheme,
  setTheme,
};

