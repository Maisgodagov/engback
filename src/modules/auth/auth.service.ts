import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';

import type { AuthTokens, UserProfileDto } from '../../shared/types';
import { UserRole } from '../../shared/types';

import type { LoginInput, RegisterInput } from './auth.schemas';
import { prisma } from '../../shared/prisma/prismaClient';

const createTokens = (user: UserProfileDto): AuthTokens => ({
  accessToken: `access-${user.id}`,
  refreshToken: `refresh-${user.id}`,
});

const ensureXpColumn = async () => {
  const [existsRow] = (await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'xpPoints'`,
  )) as Array<{ cnt: number }>;
  const exists = Number(existsRow?.cnt ?? 0) > 0;
  if (!exists) {
    await prisma.$executeRawUnsafe(`ALTER TABLE users ADD COLUMN xpPoints INT NOT NULL DEFAULT 0`);
  }
};

const mapToProfile = async (user: User): Promise<UserProfileDto> => {
  await ensureXpColumn();
  const [row] = (await prisma.$queryRawUnsafe<any[]>(`SELECT xpPoints FROM users WHERE id = ?`, user.id)) as Array<{
    xpPoints: number;
  }>;
  const xp = Number(row?.xpPoints ?? 0);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    avatarUrl: user.avatarUrl ?? undefined,
    streakDays: user.streakDays,
    completedLessons: user.completedLessons,
    level: user.level,
    xpPoints: xp,
  };
};

const login = async ({ email, password }: LoginInput) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const passwordValid = await bcrypt.compare(password, existing.passwordHash);
  if (!passwordValid) {
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  }

  const profile = await mapToProfile(existing);
  return {
    tokens: createTokens(profile),
    profile,
  };
};

const register = async ({ email, fullName, role, password }: RegisterInput) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw Object.assign(new Error('User already exists'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      role,
      passwordHash,
    },
  });

  const profile = await mapToProfile(user);
  return {
    tokens: createTokens(profile),
    profile,
  };
};

const listUsers = async (): Promise<UserProfileDto[]> => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  const profiles: UserProfileDto[] = [];
  for (const u of users) profiles.push(await mapToProfile(u));
  return profiles;
};

const logout = async () => {
  return Promise.resolve();
};

export const authService = {
  login,
  register,
  listUsers,
  logout,
};

