import type { UserProfileDto } from '../../shared/types';
import { UserRole } from '../../shared/types';

import { prisma } from '../../shared/prisma/prismaClient';

const listUsers = async (): Promise<UserProfileDto[]> => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  await ensureXpColumn();
  const ids = users.map((u) => u.id);
  const xpRows = (ids.length
    ? ((await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, xpPoints FROM users WHERE id IN (${ids.map(() => '?').join(',')})`,
        ...ids,
      )) as Array<{ id: string; xpPoints: number }>)
    : []) as Array<{ id: string; xpPoints: number }>; 
  const xpMap = new Map(xpRows.map((r) => [r.id, Number(r.xpPoints) || 0]));
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    avatarUrl: user.avatarUrl ?? undefined,
    streakDays: user.streakDays,
    completedLessons: user.completedLessons,
    level: user.level,
    xpPoints: xpMap.get(user.id) ?? 0,
  }));
};

const ensureStreakTable = async () => {
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS user_streaks (
      userId VARCHAR(191) PRIMARY KEY,
      lastSeenAt DATETIME(3) NOT NULL,
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )`,
  );
};

const ensureXpColumn = async () => {
  const [existsRow] = (await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'xpPoints'`,
  )) as Array<{ cnt: number }>;
  const exists = Number(existsRow?.cnt ?? 0) > 0;
  if (!exists) {
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN xpPoints INT NOT NULL DEFAULT 0`);
  }
};

const refreshStreak = async (userId: string): Promise<{ streakDays: number }> => {
  await ensureStreakTable();
  const now = new Date();

  const [streakRow] = (await prisma.$queryRawUnsafe<any[]>(
    `SELECT lastSeenAt FROM user_streaks WHERE userId = ? LIMIT 1`,
    userId,
  )) as Array<{ lastSeenAt: Date }>;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { streakDays: true } });
  let current = user?.streakDays ?? 0;
  let next = 1;

  if (!streakRow) {
    next = 1;
  } else {
    const [diffRow] = (await prisma.$queryRawUnsafe<any[]>(
      `SELECT DATEDIFF(CURRENT_DATE(), DATE(lastSeenAt)) as days FROM user_streaks WHERE userId = ? LIMIT 1`,
      userId,
    )) as Array<{ days: number }>;
    const days = Number(diffRow?.days ?? 999);
    if (Number.isNaN(days) || days > 1) {
      next = 1;
    } else if (days === 1) {
      next = Math.max(1, current) + 1;
    } else {
      next = Math.max(1, current);
    }
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO user_streaks (userId, lastSeenAt, updatedAt)
     VALUES (?, ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE lastSeenAt = VALUES(lastSeenAt), updatedAt = CURRENT_TIMESTAMP(3)`,
    userId,
    now,
  );

  await prisma.user.update({ where: { id: userId }, data: { streakDays: next } });
  return { streakDays: next };
};

export const usersService = {
  listUsers,
  refreshStreak,
  addXp: async (userId: string, amount: number): Promise<{ xpPoints: number }> => {
    await ensureXpColumn();
    await prisma.$executeRawUnsafe(
      `UPDATE users SET xpPoints = GREATEST(0, xpPoints + ?) WHERE id = ?`,
      amount,
      userId,
    );
    const [row] = (await prisma.$queryRawUnsafe<any[]>(`SELECT xpPoints FROM users WHERE id = ?`, userId)) as Array<{
      xpPoints: number;
    }>;
    return { xpPoints: Number(row?.xpPoints ?? 0) };
  },
};

