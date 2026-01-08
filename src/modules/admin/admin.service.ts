import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/prisma/prismaClient';

type MuellerWord = {
  id: number;
  word: string;
  part_of_speech: string | null;
  translations: string;
  moderated: number;
};

type PrecomputedExercise = {
  id: number;
  word_id: number;
  word: string;
  part_of_speech: string | null;
  translations: string;
  direction: string;
  prompt: string;
  correct_answer: string;
  options: string;
  moderated: number;
};

type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl: string | null;
  watchedCount: bigint | number | null;
  likedCount: bigint | number | null;
  lastSeenAt: Date | null;
};

let streakTableChecked = false;

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

export const adminService = {
  async getUsers(
    page: number,
    limit: number,
  ): Promise<{
    items: Array<{
      id: string;
      email: string;
      fullName: string;
      role: string;
      avatarUrl?: string;
      watchedCount: number;
      likedCount: number;
    }>;
    total: number;
    page: number;
    totalPages: number;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;

    await ensureStreakTable();

    const [countResult] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) as total
      FROM users
    `);
    const total = Number(countResult?.total ?? 0);

    const items = await prisma.$queryRaw<AdminUserRow[]>(Prisma.sql`
      SELECT
        u.id,
        u.email,
        u.fullName,
        u.role,
        u.avatarUrl,
        COALESCE(vlp.watchedCount, 0) as watchedCount,
        COALESCE(vl.likedCount, 0) as likedCount,
        us.lastSeenAt as lastSeenAt
      FROM users u
      LEFT JOIN user_streaks us ON us.userId = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) as watchedCount
        FROM video_learning_progress
        WHERE status IN ('WATCHED', 'COMPLETED')
        GROUP BY user_id
      ) vlp ON vlp.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) as likedCount
        FROM video_likes
        GROUP BY user_id
      ) vl ON vl.user_id = u.id
      ORDER BY u.createdAt DESC
      LIMIT ${safeLimit} OFFSET ${offset}
    `);

    return {
      items: items.map((row) => ({
        id: row.id,
        email: row.email,
        fullName: row.fullName,
        role: row.role,
        avatarUrl: row.avatarUrl ?? undefined,
        watchedCount: Number(row.watchedCount ?? 0),
        likedCount: Number(row.likedCount ?? 0),
        lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      })),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  },

  async updateUserRole(id: string, role: string): Promise<void> {
    const normalized = String(role ?? '').toLowerCase();
    const allowed = new Set(['student', 'teacher', 'admin']);
    if (!allowed.has(normalized)) {
      throw new Error('Invalid role');
    }

    await prisma.user.update({
      where: { id },
      data: { role: normalized as any },
      select: { id: true },
    });
  },

  async getWords(
    page: number,
    limit: number,
    moderatedFilter?: string,
    search?: string,
  ): Promise<{ words: MuellerWord[]; total: number; page: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    const conditions: Prisma.Sql[] = [];
    if (moderatedFilter === 'true') conditions.push(Prisma.sql`moderated = 1`);
    if (moderatedFilter === 'false') conditions.push(Prisma.sql`moderated = 0`);
    if (search) conditions.push(Prisma.sql`word LIKE ${'%' + search + '%'}`);

    const combinedWhere = conditions.reduce<Prisma.Sql | null>((acc, cond) => {
      if (!acc) return cond;
      return Prisma.sql`${acc} AND ${cond}`;
    }, null);
    const whereClause = combinedWhere ? Prisma.sql`WHERE ${combinedWhere}` : Prisma.empty;

    const countSql: any = Prisma.sql`
      SELECT COUNT(*) as total
      FROM mueller_dictionary
      ${whereClause}
    `;

    const [countResult] = await prisma.$queryRaw<{ total: bigint }[]>(countSql);
    const total = Number(countResult.total);

    const wordsQuery: any = Prisma.sql`
      SELECT id, word, part_of_speech, translations, moderated
      FROM mueller_dictionary
      ${whereClause}
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `;

    const words = await prisma.$queryRaw<MuellerWord[]>(wordsQuery);

    return {
      words,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  async updateWord(
    id: number,
    word: string,
    partOfSpeech: string | null,
    translations: string[],
  ): Promise<void> {
    const translationsStr = translations.join('||');

    await prisma.$executeRaw(Prisma.sql`
      UPDATE mueller_dictionary
      SET word = ${word},
          part_of_speech = ${partOfSpeech},
          translations = ${translationsStr}
      WHERE id = ${id}
    `);
  },

  async deleteWord(id: number): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM mueller_dictionary WHERE id = ${id}
    `);
  },

  async moderateWord(id: number, moderated: boolean): Promise<void> {
    const moderatedInt = moderated ? 1 : 0;

    await prisma.$executeRaw(Prisma.sql`
      UPDATE mueller_dictionary
      SET moderated = ${moderatedInt}
      WHERE id = ${id}
    `);
  },

  // Precomputed exercises
  async getPrecomputedExercises(
    page: number,
    limit: number,
    moderatedFilter?: string,
    search?: string,
  ): Promise<{ items: PrecomputedExercise[]; total: number; page: number; totalPages: number }> {
    const offset = (page - 1) * limit;
    const conditions: Prisma.Sql[] = [];
    if (moderatedFilter === 'true') conditions.push(Prisma.sql`moderated = 1`);
    if (moderatedFilter === 'false') conditions.push(Prisma.sql`moderated = 0`);
    if (search) conditions.push(Prisma.sql`prompt LIKE ${'%' + search + '%'}`);

    const combinedWhere2 = conditions.reduce<Prisma.Sql | null>((acc, cond) => {
      if (!acc) return cond;
      return Prisma.sql`${acc} AND ${cond}`;
    }, null);
    const whereClause = combinedWhere2 ? Prisma.sql`WHERE ${combinedWhere2}` : Prisma.empty;

    const countSql2: any = Prisma.sql`
      SELECT COUNT(*) as total
      FROM precomputed_exercises
      ${whereClause}
    `;

    const [countResult] = await prisma.$queryRaw<{ total: bigint }[]>(countSql2);
    const total = Number(countResult.total);

    const itemsQuery: any = Prisma.sql`
      SELECT id, word_id, word, part_of_speech, translations, direction, prompt, correct_answer, options, moderated
      FROM precomputed_exercises
      ${whereClause}
      ORDER BY id
      LIMIT ${limit} OFFSET ${offset}
    `;

    const items = await prisma.$queryRaw<PrecomputedExercise[]>(itemsQuery);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  },

  async updatePrecomputedExercise(
    id: number,
    prompt: string,
    correctAnswer: string,
    options: string[],
    translations: string[],
    partOfSpeech: string | null,
  ): Promise<void> {
    const optionsStr = JSON.stringify(options);
    const translationsStr = translations.join('||');

    await prisma.$executeRaw(Prisma.sql`
      UPDATE precomputed_exercises
      SET prompt = ${prompt},
          correct_answer = ${correctAnswer},
          options = ${optionsStr},
          translations = ${translationsStr},
          part_of_speech = ${partOfSpeech}
      WHERE id = ${id}
    `);
  },

  async deletePrecomputedExercise(id: number): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM precomputed_exercises WHERE id = ${id}
    `);
  },

  async moderatePrecomputedExercise(id: number, moderated: boolean): Promise<void> {
    const moderatedInt = moderated ? 1 : 0;

    await prisma.$executeRaw(Prisma.sql`
      UPDATE precomputed_exercises
      SET moderated = ${moderatedInt}
      WHERE id = ${id}
    `);
  },
};
