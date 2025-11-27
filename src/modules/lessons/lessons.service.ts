import { Prisma } from '@prisma/client';

import { prisma } from '../../shared/prisma/prismaClient';

type DbLessonRow = {
  id: number;
  slug: string;
  title: string;
  topic: string;
  description: string | null;
  thumbnail: string | null;
  duration_sec: number | null;
  exercises_count: number;
};

type DbExerciseRow = {
  id: number;
  lesson_id: number;
  phrase: string;
  hint: string | null;
  video_content_id: number;
  video_start_ms: number | null;
  video_end_ms: number | null;
  distractors: string | null; // JSON
  points: number;
  exercise_order: number;
};

export type Lesson = DbLessonRow;
export type LessonExercise = {
  id: number;
  phrase: string;
  hint: string | null;
  videoContentId: number;
  videoStartMs: number | null;
  videoEndMs: number | null;
  distractors: string[]; // parsed JSON
  points: number;
  order: number;
};

export const lessonsService = {
  async listLessons(limit = 50, offset = 0): Promise<Lesson[]> {
    const rows = await prisma.$queryRaw<DbLessonRow[]>(Prisma.sql`
      SELECT
        l.id,
        l.slug,
        l.title,
        l.topic,
        l.description,
        l.thumbnail,
        l.duration_sec,
        COUNT(e.id) AS exercises_count
      FROM lessons l
      LEFT JOIN lesson_exercises e ON e.lesson_id = l.id
      GROUP BY l.id, l.slug, l.title, l.topic, l.description, l.thumbnail, l.duration_sec
      ORDER BY l.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    return rows;
  },

  async getLessonById(id: number): Promise<{ lesson: Lesson | null; exercises: LessonExercise[] }> {
    const [lessonRow] = await prisma.$queryRaw<DbLessonRow[]>(Prisma.sql`
      SELECT
        l.id,
        l.slug,
        l.title,
        l.topic,
        l.description,
        l.thumbnail,
        l.duration_sec,
        COUNT(e.id) AS exercises_count
      FROM lessons l
      LEFT JOIN lesson_exercises e ON e.lesson_id = l.id
      WHERE l.id = ${id}
      GROUP BY l.id, l.slug, l.title, l.topic, l.description, l.thumbnail, l.duration_sec
      LIMIT 1
    `);

    if (!lessonRow) {
      return { lesson: null, exercises: [] };
    }

    const exerciseRows = await prisma.$queryRaw<DbExerciseRow[]>(Prisma.sql`
      SELECT
        id,
        lesson_id,
        phrase,
        hint,
        video_content_id,
        video_start_ms,
        video_end_ms,
        distractors,
        points,
        exercise_order
      FROM lesson_exercises
      WHERE lesson_id = ${id}
      ORDER BY exercise_order ASC, id ASC
    `);

    const exercises: LessonExercise[] = exerciseRows.map((row) => {
      let distractors: string[] = [];
      try {
        if (row.distractors) {
          const parsed = JSON.parse(row.distractors);
          if (Array.isArray(parsed)) distractors = parsed.map((v) => String(v));
        }
      } catch (err) {
        console.error('[LESSONS] Failed to parse distractors', err);
      }

      return {
        id: row.id,
        phrase: row.phrase,
        hint: row.hint,
        videoContentId: row.video_content_id,
        videoStartMs: row.video_start_ms,
        videoEndMs: row.video_end_ms,
        distractors,
        points: row.points,
        order: row.exercise_order,
      };
    });

    return { lesson: lessonRow, exercises };
  },

  async createLesson(payload: {
    slug: string;
    title: string;
    topic: string;
    description?: string | null;
    thumbnail?: string | null;
    durationSec?: number | null;
    exercises: Array<{
      phrase: string;
      hint?: string | null;
      videoContentId: number;
      videoStartMs?: number | null;
      videoEndMs?: number | null;
      distractors?: string[];
      points?: number;
      order?: number;
    }>;
  }): Promise<number> {
    const result = await prisma.$transaction(async (tx) => {
      const insertLesson = await tx.$executeRaw<Prisma.Sql>(Prisma.sql`
        INSERT INTO lessons (slug, title, topic, description, thumbnail, duration_sec)
        VALUES (${payload.slug}, ${payload.title}, ${payload.topic}, ${payload.description ?? null}, ${payload.thumbnail ?? null}, ${payload.durationSec ?? null})
      `);
      // get last insert id
      const [{ last_id }] = await tx.$queryRaw<{ last_id: bigint }[]>(Prisma.sql`SELECT LAST_INSERT_ID() as last_id`);
      const lessonId = Number(last_id);

      for (const ex of payload.exercises) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO lesson_exercises
            (lesson_id, phrase, hint, video_content_id, video_start_ms, video_end_ms, distractors, points, exercise_order)
          VALUES (
            ${lessonId},
            ${ex.phrase},
            ${ex.hint ?? null},
            ${ex.videoContentId},
            ${ex.videoStartMs ?? null},
            ${ex.videoEndMs ?? null},
            ${ex.distractors ? JSON.stringify(ex.distractors) : null},
            ${ex.points ?? 10},
            ${ex.order ?? 0}
          )
        `);
      }

      return lessonId;
    });

    return Number(result);
  },

  async updateLesson(
    id: number,
    payload: {
      slug: string;
      title: string;
      topic: string;
      description?: string | null;
      thumbnail?: string | null;
      durationSec?: number | null;
      exercises: Array<{
        phrase: string;
        hint?: string | null;
        videoContentId: number;
        videoStartMs?: number | null;
        videoEndMs?: number | null;
        distractors?: string[];
        points?: number;
        order?: number;
      }>;
    },
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE lessons
        SET slug = ${payload.slug},
            title = ${payload.title},
            topic = ${payload.topic},
            description = ${payload.description ?? null},
            thumbnail = ${payload.thumbnail ?? null},
            duration_sec = ${payload.durationSec ?? null}
        WHERE id = ${id}
      `);

      // replace exercises
      await tx.$executeRaw(Prisma.sql`DELETE FROM lesson_exercises WHERE lesson_id = ${id}`);

      for (const ex of payload.exercises) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO lesson_exercises
            (lesson_id, phrase, hint, video_content_id, video_start_ms, video_end_ms, distractors, points, exercise_order)
          VALUES (
            ${id},
            ${ex.phrase},
            ${ex.hint ?? null},
            ${ex.videoContentId},
            ${ex.videoStartMs ?? null},
            ${ex.videoEndMs ?? null},
            ${ex.distractors ? JSON.stringify(ex.distractors) : null},
            ${ex.points ?? 10},
            ${ex.order ?? 0}
          )
        `);
      }
    });
  },

  async deleteLesson(id: number): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM lessons WHERE id = ${id}`);
  },
};
