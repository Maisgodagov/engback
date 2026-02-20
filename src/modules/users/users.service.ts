import type { UserProfileDto } from '../../shared/types';
import { UserRole } from '../../shared/types';

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma/prismaClient';

// OPTIMIZATION: Cache flags to avoid checking schema on every request
let xpColumnChecked = false;

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

const dayKeyUtc = (value: Date): number =>
  Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

const dayDiffUtc = (left: Date, right: Date): number =>
  Math.floor((dayKeyUtc(left) - dayKeyUtc(right)) / 86_400_000);

const loadTrainingCompletionDates = async (userId: string): Promise<Date[]> => {
  const rows = await prisma.$queryRaw<Array<{ completedDate: Date }>>(Prisma.sql`
    SELECT DISTINCT DATE(completed_at) AS completedDate
    FROM word_training_sessions
    WHERE user_id = ${userId}
      AND status = 'completed'
      AND completed_at IS NOT NULL
      AND words_completed > 0
    ORDER BY completedDate DESC
  `);
  return rows
    .map((row) => new Date(row.completedDate))
    .filter((date) => Number.isFinite(date.getTime()));
};

const calculateTrainingStreak = (datesDesc: Date[], now = new Date()): number => {
  if (!datesDesc.length) return 0;
  const latest = datesDesc[0];
  const latestDiff = dayDiffUtc(now, latest);
  if (!Number.isFinite(latestDiff) || latestDiff > 1) return 0;

  let streak = 1;
  let previous = latest;
  for (let i = 1; i < datesDesc.length; i += 1) {
    const current = datesDesc[i];
    const diff = dayDiffUtc(previous, current);
    if (diff !== 1) break;
    streak += 1;
    previous = current;
  }
  return streak;
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
  const completionDates = await loadTrainingCompletionDates(userId);
  const next = calculateTrainingStreak(completionDates, new Date());
  await prisma.user.update({ where: { id: userId }, data: { streakDays: next } });
  return { streakDays: next };
};

export const usersService = {
  listUsers,
  refreshStreak,
  getStreakHistory: async (userId: string): Promise<{ dates: string[] }> => {
    const completionDates = await loadTrainingCompletionDates(userId);
    const dates = completionDates.map((date) => date.toISOString().slice(0, 10));
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
  updateLevel: async (userId: string, level: string): Promise<{ level: string }> => {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { level },
      select: { level: true },
    });
    return { level: updated.level };
  },
};

