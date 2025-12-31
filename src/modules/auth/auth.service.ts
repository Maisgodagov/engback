import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { User } from '@prisma/client';

import type { AuthTokens, UserProfileDto } from '../../shared/types';
import { UserRole } from '../../shared/types';

import type { LoginInput, RegisterInput, TelegramLoginInput } from './auth.schemas';
import { prisma } from '../../shared/prisma/prismaClient';

const createTokens = (user: UserProfileDto): AuthTokens => ({
  accessToken: `access-${user.id}`,
  refreshToken: `refresh-${user.id}`,
});

const parseTelegramInitData = (initData: string) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw Object.assign(new Error('Missing TELEGRAM_BOT_TOKEN'), { status: 500 });
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw Object.assign(new Error('Invalid Telegram data: no hash'), { status: 401 });
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  // Telegram WebApp signature: secret = HMAC_SHA256("WebAppData", botToken)
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const signature = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (signature !== hash) {
    throw Object.assign(new Error('Invalid Telegram signature'), { status: 401 });
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw Object.assign(new Error('Invalid Telegram data: no user'), { status: 401 });
  }

  let userData: any;
  try {
    userData = JSON.parse(userRaw);
  } catch {
    throw Object.assign(new Error('Invalid Telegram user payload'), { status: 401 });
  }

  return {
    id: String(userData.id),
    firstName: userData.first_name as string | undefined,
    lastName: userData.last_name as string | undefined,
    username: userData.username as string | undefined,
    photoUrl: userData.photo_url as string | undefined,
    languageCode: userData.language_code as string | undefined,
  };
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
  await ensureXpColumn();

  // OPTIMIZATION: Single query instead of N+1 (1 query vs 100+ queries for 100 users)
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' }
  });

  // User model already has xpPoints field, no need for separate queries
  return users.map(user => ({
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

const telegramAuth = async ({ initData }: TelegramLoginInput) => {
  const telegram = parseTelegramInitData(initData);
  const email = `tg-${telegram.id}@telegram.local`;
  const fullName =
    [telegram.firstName, telegram.lastName].filter(Boolean).join(' ').trim() ||
    telegram.username ||
    `tg-user-${telegram.id}`;

  let user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    user = await prisma.user.create({
      data: {
        email,
        fullName,
        role: UserRole.Student,
        passwordHash,
        avatarUrl: telegram.photoUrl ?? null,
      },
    });
  } else {
    const dataToUpdate: Partial<User> = {};
    if (telegram.photoUrl && user.avatarUrl !== telegram.photoUrl) {
      dataToUpdate.avatarUrl = telegram.photoUrl;
    }
    if (fullName && user.fullName !== fullName) {
      dataToUpdate.fullName = fullName;
    }
    if (Object.keys(dataToUpdate).length > 0) {
      user = await prisma.user.update({ where: { id: user.id }, data: dataToUpdate });
    }
  }

  const profile = await mapToProfile(user);
  return {
    tokens: createTokens(profile),
    profile,
  };
};

export const authService = {
  login,
  register,
  listUsers,
  logout: async () => Promise.resolve(),
  telegramAuth,
};

