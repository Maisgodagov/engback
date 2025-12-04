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
  type: string;
  options: string | null; // JSON
  answer: string | null;
};

export type Lesson = DbLessonRow;
export type LessonExercise = {
  id: number;
  type: 'assemble' | 'cloze' | 'mcq' | 'match';
  phrase: string;
  hint: string | null;
  videoContentId: number;
  videoStartMs: number | null;
  videoEndMs: number | null;
  distractors: string[]; // parsed JSON
  points: number;
  order: number;
  options: any;
  answer: string | null;
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

    console.log('[LESSONS] Raw rows count:', rows.length);
    if (rows.length > 0) {
      console.log('[LESSONS] First row sample:', {
        id: rows[0].id,
        exercises_count: rows[0].exercises_count,
        exercises_count_type: typeof rows[0].exercises_count,
      });
    }

    const mapped = rows.map((row) => {
      const result = {
        id: row.id,
        slug: row.slug,
        title: row.title,
        topic: row.topic,
        description: row.description,
        thumbnail: row.thumbnail,
        duration_sec: row.duration_sec,
        exercises_count: Number(row.exercises_count),
      };
      return result;
    });

    if (mapped.length > 0) {
      console.log('[LESSONS] First mapped row:', {
        id: mapped[0].id,
        exercises_count: mapped[0].exercises_count,
        exercises_count_type: typeof mapped[0].exercises_count,
      });
    }

    return mapped;
  },

  async getLessonById(id: number): Promise<{ lesson: Lesson | null; exercises: LessonExercise[] }> {
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
      WHERE l.id = ${id}
      GROUP BY l.id, l.slug, l.title, l.topic, l.description, l.thumbnail, l.duration_sec
      LIMIT 1
    `);

    const [lessonRow] = rows;

    if (!lessonRow) {
      return { lesson: null, exercises: [] };
    }

    const lesson = {
      ...lessonRow,
      exercises_count: Number(lessonRow.exercises_count),
    };

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
        exercise_order,
        type,
        options,
        answer
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

      let options: any = null;
      try {
        if (row.options) {
          options = JSON.parse(row.options);
        }
      } catch (err) {
        console.error('[LESSONS] Failed to parse options', err);
      }

      return {
        id: row.id,
        type: row.type as any,
        phrase: row.phrase,
        hint: row.hint,
        videoContentId: row.video_content_id,
        videoStartMs: row.video_start_ms,
        videoEndMs: row.video_end_ms,
        distractors,
        points: row.points,
        order: row.exercise_order,
        options,
        answer: row.answer,
      };
    });

    return { lesson, exercises };
  },

  async createLesson(payload: {
    slug: string;
    title: string;
    topic: string;
    description?: string | null;
    thumbnail?: string | null;
    durationSec?: number | null;
    exercises: Array<{
      type: 'assemble' | 'cloze' | 'mcq' | 'match';
      phrase: string;
      hint?: string | null;
      videoContentId: number;
      videoStartMs?: number | null;
      videoEndMs?: number | null;
      distractors?: string[];
      points?: number;
      order?: number;
      options?: any;
      answer?: string | null;
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
            (lesson_id, phrase, hint, video_content_id, video_start_ms, video_end_ms, distractors, points, exercise_order, type, options, answer)
          VALUES (
            ${lessonId},
            ${ex.phrase},
            ${ex.hint ?? null},
            ${ex.videoContentId},
            ${ex.videoStartMs ?? null},
            ${ex.videoEndMs ?? null},
            ${ex.distractors ? JSON.stringify(ex.distractors) : null},
            ${ex.points ?? 10},
            ${ex.order ?? 0},
            ${ex.type},
            ${ex.options ? JSON.stringify(ex.options) : null},
            ${ex.answer ?? null}
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
        type: 'assemble' | 'cloze' | 'mcq' | 'match';
        phrase: string;
        hint?: string | null;
        videoContentId: number;
        videoStartMs?: number | null;
        videoEndMs?: number | null;
        distractors?: string[];
        points?: number;
        order?: number;
        options?: any;
        answer?: string | null;
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
            (lesson_id, phrase, hint, video_content_id, video_start_ms, video_end_ms, distractors, points, exercise_order, type, options, answer)
          VALUES (
            ${id},
            ${ex.phrase},
            ${ex.hint ?? null},
            ${ex.videoContentId},
            ${ex.videoStartMs ?? null},
            ${ex.videoEndMs ?? null},
            ${ex.distractors ? JSON.stringify(ex.distractors) : null},
            ${ex.points ?? 10},
            ${ex.order ?? 0},
            ${ex.type},
            ${ex.options ? JSON.stringify(ex.options) : null},
            ${ex.answer ?? null}
          )
        `);
      }
    });
  },

  async deleteLesson(id: number): Promise<void> {
    await prisma.$executeRaw(Prisma.sql`DELETE FROM lessons WHERE id = ${id}`);
  },
};
