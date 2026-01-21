import type { UserProfileDto } from '../../shared/types';
import { UserRole } from '../../shared/types';

import { prisma } from '../../shared/prisma/prismaClient';

// OPTIMIZATION: Cache flags to avoid checking schema on every request
let xpColumnChecked = false;
let streakTableChecked = false;
let streakHistoryChecked = false;

const listUsers = async (limit?: number, offset?: number): Promise<UserProfileDto[]> => {
  // OPTIMIZATION: Check xpColumn only once at startup
  if (!xpColumnChecked) {
    await ensureXpColumn();
  }

  // CRITICAL FIX: Add pagination to prevent loading all 1000+ users at once
  const take = limit && limit > 0 ? Math.min(limit, 100) : 100; // Max 100 per page
  const skip = offset && offset > 0 ? offset : 0;

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take,
    skip,
  });

  // OPTIMIZATION: xpPoints is in User model (schema.prisma line 23), use it directly
  return users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    avatarUrl: user.avatarUrl ?? undefined,
    streakDays: user.streakDays,
    completedLessons: user.completedLessons,
    level: user.level,
    xpPoints: user.xpPoints ?? 0,
  }));
};

const ensureStreakTable = async () => {
  if (streakTableChecked) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS user_streaks (
      userId VARCHAR(191) PRIMARY KEY,
      lastSeenAt DATETIME(3) NOT NULL,
      updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    )`,
  );
  streakTableChecked = true;
};

const ensureStreakHistoryTable = async () => {
  if (streakHistoryChecked) return;
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS user_streak_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId VARCHAR(191) NOT NULL,
      seenDate DATE NOT NULL,
      createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uniq_user_date (userId, seenDate)
    )`,
  );
  streakHistoryChecked = true;
};

const ensureXpColumn = async () => {
  if (xpColumnChecked) return;
  const [existsRow] = (await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'xpPoints'`,
  )) as Array<{ cnt: number }>;
  const exists = Number(existsRow?.cnt ?? 0) > 0;
  if (!exists) {
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN xpPoints INT NOT NULL DEFAULT 0`);
  }
  xpColumnChecked = true;
};

const refreshStreak = async (userId: string): Promise<{ streakDays: number }> => {
  await ensureStreakTable();
  await ensureStreakHistoryTable();
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
    const lastSeenAt = new Date(streakRow.lastSeenAt);
    const dayKey = (value: Date) =>
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    const dayDiff = Math.floor((dayKey(now) - dayKey(lastSeenAt)) / 86400000);

    if (!Number.isFinite(dayDiff) || dayDiff > 1) {
      next = 1;
    } else if (dayDiff === 1) {
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

  await prisma.$executeRawUnsafe(
    `INSERT IGNORE INTO user_streak_history (userId, seenDate)
     VALUES (?, DATE(?))`,
    userId,
    now,
  );

  await prisma.user.update({ where: { id: userId }, data: { streakDays: next } });
  return { streakDays: next };
};

export const usersService = {
  listUsers,
  refreshStreak,
  getStreakHistory: async (userId: string): Promise<{ dates: string[] }> => {
    await ensureStreakHistoryTable();
    const rows = (await prisma.$queryRawUnsafe<any[]>(
      `SELECT seenDate FROM user_streak_history WHERE userId = ? ORDER BY seenDate DESC`,
      userId,
    )) as Array<{ seenDate: Date }>;
    const dates = rows.map((row) => row.seenDate.toISOString().slice(0, 10));
    return { dates };
  },
  addXp: async (userId: string, amount: number): Promise<{ xpPoints: number }> => {
    // OPTIMIZATION: Check only once, not on every addXp call
    if (!xpColumnChecked) {
      await ensureXpColumn();
    }

    // OPTIMIZATION: Use Prisma update instead of raw SQL + separate SELECT
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        xpPoints: {
          increment: amount,
        },
      },
      select: { xpPoints: true },
    });

    // Ensure xpPoints doesn't go below 0
    if (updated.xpPoints < 0) {
      const fixed = await prisma.user.update({
        where: { id: userId },
        data: { xpPoints: 0 },
        select: { xpPoints: true },
      });
      return { xpPoints: fixed.xpPoints };
    }

    return { xpPoints: updated.xpPoints };
  },
};

