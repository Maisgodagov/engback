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
  dictionaryWordsCount: bigint | number | null;
  exercisesCompletedCount: bigint | number | null;
  learnedWordsCount: bigint | number | null;
  currentStreakDays: number | null;
  lastSeenAt: Date | null;
};

type AdminUsersSummaryRow = {
  totalUsers: bigint | number | null;
  activeToday: bigint | number | null;
  activeWeek: bigint | number | null;
  activeMonth: bigint | number | null;
};

type DailyUserActivityRow = {
  day: Date;
  videosWatched: bigint | number | null;
  likesGiven: bigint | number | null;
  exercisesCompleted: bigint | number | null;
  wordsAdded: bigint | number | null;
  wordsSearched: bigint | number | null;
  phrasesAdded: bigint | number | null;
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
    search?: string,
  ): Promise<{
    items: Array<{
      id: string;
      email: string;
      fullName: string;
      role: string;
      avatarUrl?: string;
      watchedCount: number;
      likedCount: number;
      dictionaryWordsCount: number;
      exercisesCompletedCount: number;
      learnedWordsCount: number;
      currentStreakDays: number;
      lastSeenAt: string | null;
    }>;
    summary: {
      totalUsers: number;
      activeToday: number;
      activeWeek: number;
      activeMonth: number;
    };
    total: number;
    page: number;
    totalPages: number;
  }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * safeLimit;

    try {
      await ensureStreakTable();
    } catch (error) {
      console.warn('[ADMIN] ensureStreakTable skipped:', error);
    }
    const normalizedSearch = String(search ?? '').trim().toLowerCase();
    const whereClause = normalizedSearch
      ? Prisma.sql`WHERE LOWER(u.fullName) LIKE ${`%${normalizedSearch}%`} OR LOWER(u.email) LIKE ${`%${normalizedSearch}%`}`
      : Prisma.empty;

    try {
      const [countResult] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) as total
        FROM users u
        ${whereClause}
      `);
      const total = Number(countResult?.total ?? 0);

      const [summaryRow] = await prisma.$queryRaw<AdminUsersSummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(*) AS totalUsers,
        SUM(
          CASE
            WHEN activity.lastSeenAt IS NOT NULL AND DATE(activity.lastSeenAt) = CURDATE() THEN 1
            ELSE 0
          END
        ) AS activeToday,
        SUM(
          CASE
            WHEN activity.lastSeenAt IS NOT NULL AND DATE(activity.lastSeenAt) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN 1
            ELSE 0
          END
        ) AS activeWeek,
        SUM(
          CASE
            WHEN activity.lastSeenAt IS NOT NULL AND DATE(activity.lastSeenAt) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN 1
            ELSE 0
          END
        ) AS activeMonth
      FROM (
        SELECT
          u.id,
          NULLIF(
            GREATEST(
              IFNULL(us.lastSeenAt, '1970-01-01 00:00:00'),
              IFNULL(vlp.lastVideoAt, '1970-01-01 00:00:00'),
              IFNULL(vl.lastLikeAt, '1970-01-01 00:00:00'),
              IFNULL(uw.lastWordAt, '1970-01-01 00:00:00'),
              IFNULL(up.lastExerciseAt, '1970-01-01 00:00:00'),
              IFNULL(udv.lastSearchAt, '1970-01-01 00:00:00'),
              IFNULL(wts.lastTrainingAt, '1970-01-01 00:00:00'),
              IFNULL(u.updatedAt, '1970-01-01 00:00:00'),
              IFNULL(u.createdAt, '1970-01-01 00:00:00')
            ),
            '1970-01-01 00:00:00'
          ) AS lastSeenAt
        FROM users u
        LEFT JOIN user_streaks us ON us.userId = u.id
        LEFT JOIN (
          SELECT user_id, MAX(updated_at) AS lastVideoAt
          FROM video_learning_progress
          GROUP BY user_id
        ) vlp ON vlp.user_id = u.id
        LEFT JOIN (
          SELECT user_id, MAX(created_at) AS lastLikeAt
          FROM video_likes
          GROUP BY user_id
        ) vl ON vl.user_id = u.id
        LEFT JOIN (
          SELECT userId, MAX(createdAt) AS lastWordAt
          FROM user_words
          GROUP BY userId
        ) uw ON uw.userId = u.id
        LEFT JOIN (
          SELECT user_id, MAX(updated_at) AS lastExerciseAt
          FROM user_word_progress
          GROUP BY user_id
        ) up ON up.user_id = u.id
        LEFT JOIN (
          SELECT user_id, MAX(updated_at) AS lastSearchAt
          FROM user_dictionary_views
          GROUP BY user_id
        ) udv ON udv.user_id = u.id
        LEFT JOIN (
          SELECT user_id, MAX(COALESCE(completed_at, started_at)) AS lastTrainingAt
          FROM word_training_sessions
          GROUP BY user_id
        ) wts ON wts.user_id = u.id
      ) activity
      `);

      const items = await prisma.$queryRaw<AdminUserRow[]>(Prisma.sql`
      SELECT
        u.id,
        u.email,
        u.fullName,
        u.role,
        u.avatarUrl,
        COALESCE(vlp.watchedCount, 0) as watchedCount,
        COALESCE(vl.likedCount, 0) as likedCount,
        COALESCE(uw.wordsCount, 0) as dictionaryWordsCount,
        COALESCE(up.totalTouches, 0) as exercisesCompletedCount,
        COALESCE(up.learnedWords, 0) as learnedWordsCount,
        u.streakDays as currentStreakDays,
        NULLIF(
          GREATEST(
            IFNULL(us.lastSeenAt, '1970-01-01 00:00:00'),
            IFNULL(vlp.lastVideoAt, '1970-01-01 00:00:00'),
            IFNULL(vl.lastLikeAt, '1970-01-01 00:00:00'),
            IFNULL(uw.lastWordAt, '1970-01-01 00:00:00'),
            IFNULL(up.lastExerciseAt, '1970-01-01 00:00:00'),
            IFNULL(udv.lastSearchAt, '1970-01-01 00:00:00'),
            IFNULL(wts.lastTrainingAt, '1970-01-01 00:00:00'),
            IFNULL(u.updatedAt, '1970-01-01 00:00:00'),
            IFNULL(u.createdAt, '1970-01-01 00:00:00')
          ),
          '1970-01-01 00:00:00'
        ) as lastSeenAt
      FROM users u
      LEFT JOIN user_streaks us ON us.userId = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) as watchedCount, MAX(updated_at) as lastVideoAt
        FROM video_learning_progress
        WHERE status IN ('WATCHED', 'COMPLETED')
        GROUP BY user_id
      ) vlp ON vlp.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) as likedCount, MAX(created_at) as lastLikeAt
        FROM video_likes
        GROUP BY user_id
      ) vl ON vl.user_id = u.id
      LEFT JOIN (
        SELECT userId, COUNT(*) as wordsCount, MAX(createdAt) as lastWordAt
        FROM user_words
        GROUP BY userId
      ) uw ON uw.userId = u.id
        LEFT JOIN (
          SELECT
            user_id,
            SUM(COALESCE(touches_total, 0)) as totalTouches,
            SUM(CASE WHEN status = 'known' THEN 1 ELSE 0 END) as learnedWords,
            MAX(updated_at) as lastExerciseAt
          FROM user_word_progress
          GROUP BY user_id
        ) up ON up.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(updated_at) as lastSearchAt
        FROM user_dictionary_views
        GROUP BY user_id
      ) udv ON udv.user_id = u.id
      LEFT JOIN (
        SELECT user_id, MAX(COALESCE(completed_at, started_at)) as lastTrainingAt
        FROM word_training_sessions
        GROUP BY user_id
      ) wts ON wts.user_id = u.id
      ${whereClause}
      ORDER BY lastSeenAt DESC, u.createdAt DESC
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
          dictionaryWordsCount: Number(row.dictionaryWordsCount ?? 0),
          exercisesCompletedCount: Number(row.exercisesCompletedCount ?? 0),
          learnedWordsCount: Number(row.learnedWordsCount ?? 0),
          currentStreakDays: Number(row.currentStreakDays ?? 0),
          lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        })),
        summary: {
          totalUsers: Number(summaryRow?.totalUsers ?? total),
          activeToday: Number(summaryRow?.activeToday ?? 0),
          activeWeek: Number(summaryRow?.activeWeek ?? 0),
          activeMonth: Number(summaryRow?.activeMonth ?? 0),
        },
        total,
        page: safePage,
        totalPages: Math.ceil(total / safeLimit),
      };
    } catch (error) {
      console.error('[ADMIN] getUsers extended query failed, fallback to compatibility mode', error);

      const [countResult] = await prisma.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT COUNT(*) as total
        FROM users u
        ${whereClause}
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
          COALESCE(uw.wordsCount, 0) as dictionaryWordsCount,
          COALESCE(up.totalTouches, 0) as exercisesCompletedCount,
          COALESCE(up.learnedWords, 0) as learnedWordsCount,
          u.streakDays as currentStreakDays,
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
        LEFT JOIN (
          SELECT userId, COUNT(*) as wordsCount
          FROM user_words
          GROUP BY userId
        ) uw ON uw.userId = u.id
        LEFT JOIN (
          SELECT
            user_id,
            SUM(COALESCE(touches_total, 0)) as totalTouches,
            SUM(CASE WHEN status = 'known' THEN 1 ELSE 0 END) as learnedWords
          FROM user_word_progress
          GROUP BY user_id
        ) up ON up.user_id = u.id
        ${whereClause}
        ORDER BY u.createdAt DESC
        LIMIT ${safeLimit} OFFSET ${offset}
      `);

      const [summaryRow] = await prisma.$queryRaw<AdminUsersSummaryRow[]>(Prisma.sql`
        SELECT
          COUNT(*) AS totalUsers,
          SUM(CASE WHEN us.lastSeenAt IS NOT NULL AND DATE(us.lastSeenAt) = CURDATE() THEN 1 ELSE 0 END) AS activeToday,
          SUM(CASE WHEN us.lastSeenAt IS NOT NULL AND DATE(us.lastSeenAt) >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) THEN 1 ELSE 0 END) AS activeWeek,
          SUM(CASE WHEN us.lastSeenAt IS NOT NULL AND DATE(us.lastSeenAt) >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) THEN 1 ELSE 0 END) AS activeMonth
        FROM users u
        LEFT JOIN user_streaks us ON us.userId = u.id
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
          dictionaryWordsCount: Number(row.dictionaryWordsCount ?? 0),
          exercisesCompletedCount: Number(row.exercisesCompletedCount ?? 0),
          learnedWordsCount: Number(row.learnedWordsCount ?? 0),
          currentStreakDays: Number(row.currentStreakDays ?? 0),
          lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
        })),
        summary: {
          totalUsers: Number(summaryRow?.totalUsers ?? total),
          activeToday: Number(summaryRow?.activeToday ?? 0),
          activeWeek: Number(summaryRow?.activeWeek ?? 0),
          activeMonth: Number(summaryRow?.activeMonth ?? 0),
        },
        total,
        page: safePage,
        totalPages: Math.ceil(total / safeLimit),
      };
    }
  },

  async getUserActivityByDay(userId: string, days: number): Promise<{
    user: {
      id: string;
      email: string;
      fullName: string;
      role: string;
    };
    days: number;
    items: Array<{
      date: string;
      didLogin: boolean;
      videosWatched: number;
      likesGiven: number;
      exercisesCompleted: number;
      wordsAdded: number;
      wordsSearched: number;
      phrasesAdded: number;
    }>;
  }> {
    const safeDays = Math.max(1, Math.min(days, 365));
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    fromDate.setDate(fromDate.getDate() - (safeDays - 1));

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, role: true },
    });
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    let rows: DailyUserActivityRow[] = [];
    try {
      rows = await prisma.$queryRaw<DailyUserActivityRow[]>(Prisma.sql`
        SELECT
          daily.day,
          SUM(daily.videosWatched) AS videosWatched,
          SUM(daily.likesGiven) AS likesGiven,
          SUM(daily.exercisesCompleted) AS exercisesCompleted,
          SUM(daily.wordsAdded) AS wordsAdded,
          SUM(daily.wordsSearched) AS wordsSearched,
          SUM(daily.phrasesAdded) AS phrasesAdded
        FROM (
          SELECT DATE(vlp.updated_at) AS day, COUNT(DISTINCT vlp.content_id) AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM video_learning_progress vlp
          WHERE vlp.user_id = ${userId} AND vlp.status IN ('WATCHED', 'COMPLETED')
          GROUP BY DATE(vlp.updated_at)

          UNION ALL

          SELECT DATE(vl.created_at) AS day, 0 AS videosWatched, COUNT(*) AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM video_likes vl
          WHERE vl.user_id = ${userId}
          GROUP BY DATE(vl.created_at)

          UNION ALL

          SELECT DATE(uwp.updated_at) AS day, 0 AS videosWatched, 0 AS likesGiven, SUM(COALESCE(uwp.touches_total, 0)) AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM user_word_progress uwp
          WHERE uwp.user_id = ${userId}
          GROUP BY DATE(uwp.updated_at)

          UNION ALL

          SELECT DATE(uw.createdAt) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, COUNT(*) AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM user_words uw
          WHERE uw.userId = ${userId}
          GROUP BY DATE(uw.createdAt)

          UNION ALL

          SELECT DATE(up.createdAt) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, COUNT(*) AS phrasesAdded
          FROM user_phrases up
          WHERE up.userId = ${userId}
          GROUP BY DATE(up.createdAt)

          UNION ALL

          SELECT DATE(udv.updated_at) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, COUNT(*) AS wordsSearched, 0 AS phrasesAdded
          FROM user_dictionary_views udv
          WHERE udv.user_id = ${userId}
          GROUP BY DATE(udv.updated_at)

          UNION ALL

          SELECT DATE(us.lastSeenAt) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM user_streaks us
          WHERE us.userId = ${userId}
          GROUP BY DATE(us.lastSeenAt)
        ) daily
        WHERE daily.day >= ${fromDate}
        GROUP BY daily.day
        ORDER BY daily.day DESC
        LIMIT ${safeDays}
      `);
    } catch (error) {
      console.error('[ADMIN] getUserActivityByDay extended query failed, fallback to compatibility mode', error);
      rows = await prisma.$queryRaw<DailyUserActivityRow[]>(Prisma.sql`
        SELECT
          daily.day,
          SUM(daily.videosWatched) AS videosWatched,
          SUM(daily.likesGiven) AS likesGiven,
          SUM(daily.exercisesCompleted) AS exercisesCompleted,
          SUM(daily.wordsAdded) AS wordsAdded,
          SUM(daily.wordsSearched) AS wordsSearched,
          SUM(daily.phrasesAdded) AS phrasesAdded
        FROM (
          SELECT DATE(vlp.updated_at) AS day, COUNT(DISTINCT vlp.content_id) AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM video_learning_progress vlp
          WHERE vlp.user_id = ${userId} AND vlp.status IN ('WATCHED', 'COMPLETED')
          GROUP BY DATE(vlp.updated_at)

          UNION ALL

          SELECT DATE(vl.created_at) AS day, 0 AS videosWatched, COUNT(*) AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM video_likes vl
          WHERE vl.user_id = ${userId}
          GROUP BY DATE(vl.created_at)

          UNION ALL

          SELECT DATE(uwp.updated_at) AS day, 0 AS videosWatched, 0 AS likesGiven, SUM(COALESCE(uwp.touches_total, 0)) AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM user_word_progress uwp
          WHERE uwp.user_id = ${userId}
          GROUP BY DATE(uwp.updated_at)

          UNION ALL

          SELECT DATE(uw.createdAt) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, COUNT(*) AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM user_words uw
          WHERE uw.userId = ${userId}
          GROUP BY DATE(uw.createdAt)

          UNION ALL

          SELECT DATE(up.createdAt) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, COUNT(*) AS phrasesAdded
          FROM user_phrases up
          WHERE up.userId = ${userId}
          GROUP BY DATE(up.createdAt)

          UNION ALL

          SELECT DATE(udv.updated_at) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, COUNT(*) AS wordsSearched, 0 AS phrasesAdded
          FROM user_dictionary_views udv
          WHERE udv.user_id = ${userId}
          GROUP BY DATE(udv.updated_at)

          UNION ALL

          SELECT DATE(us.lastSeenAt) AS day, 0 AS videosWatched, 0 AS likesGiven, 0 AS exercisesCompleted, 0 AS wordsAdded, 0 AS wordsSearched, 0 AS phrasesAdded
          FROM user_streaks us
          WHERE us.userId = ${userId}
          GROUP BY DATE(us.lastSeenAt)
        ) daily
        WHERE daily.day >= ${fromDate}
        GROUP BY daily.day
        ORDER BY daily.day DESC
        LIMIT ${safeDays}
      `);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      days: safeDays,
      items: rows.map((row) => ({
        date: row.day.toISOString().slice(0, 10),
        didLogin: true,
        videosWatched: Number(row.videosWatched ?? 0),
        likesGiven: Number(row.likesGiven ?? 0),
        exercisesCompleted: Number(row.exercisesCompleted ?? 0),
        wordsAdded: Number(row.wordsAdded ?? 0),
        wordsSearched: Number(row.wordsSearched ?? 0),
        phrasesAdded: Number(row.phrasesAdded ?? 0),
      })),
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
