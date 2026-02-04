import { randomUUID } from 'node:crypto';
import type { Fb2Metadata } from '@lingo-reader/fb2-parser';
import { prisma } from '../../shared/prisma/prismaClient';

type ListBooksResult = Array<{
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  coverUrl: string | null;
  fileUrl: string;
  language: string;
  cefrLevel: string | null;
  wordCount: number | null;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
  inShelf?: boolean;
  progress?: {
    position: number;
    progress: number;
    updatedAt: Date;
  } | null;
}>;

type UploadOptions = {
  title?: string;
  author?: string;
  description?: string;
  language?: string;
  cefrLevel?: string | null;
};

const listBooks = async (userId?: string | null): Promise<ListBooksResult> => {
  const books = await prisma.readingBook.findMany({
    where: { isPublished: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!userId) return books;

  const [shelfEntries, progressEntries] = await Promise.all([
    prisma.readingShelf.findMany({
      where: { userId },
      select: { bookId: true },
    }),
    prisma.readingProgress.findMany({
      where: { userId },
      select: { bookId: true, position: true, progress: true, updatedAt: true },
    }),
  ]);

  const shelfSet = new Set(shelfEntries.map((entry) => entry.bookId));
  const progressMap = new Map(progressEntries.map((entry) => [entry.bookId, entry]));

  return books.map((book) => ({
    ...book,
    inShelf: shelfSet.has(book.id),
    progress: progressMap.get(book.id) ?? null,
  }));
};

const getBook = async (bookId: string, userId?: string | null) => {
  const book = await prisma.readingBook.findUnique({ where: { id: bookId } });
  if (!book || (!book.isPublished && !userId)) return null;

  if (!userId) return book;

  const [inShelf, progress] = await Promise.all([
    prisma.readingShelf.findUnique({
      where: { userId_bookId: { userId, bookId } },
      select: { id: true },
    }),
    prisma.readingProgress.findUnique({
      where: { userId_bookId: { userId, bookId } },
      select: { position: true, progress: true, updatedAt: true },
    }),
  ]);

  return {
    ...book,
    inShelf: Boolean(inShelf),
    progress: progress ?? null,
  };
};

const createBook = async (payload: {
  title: string;
  author?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  fileUrl: string;
  language?: string;
  cefrLevel?: string | null;
  wordCount?: number;
  isPublished?: boolean;
}) => {
  return prisma.readingBook.create({
    data: {
      id: randomUUID(),
      title: payload.title,
      author: payload.author ?? null,
      description: payload.description ?? null,
      coverUrl: payload.coverUrl ?? null,
      fileUrl: payload.fileUrl,
      language: payload.language ?? 'en',
      cefrLevel: payload.cefrLevel ?? null,
      wordCount: payload.wordCount ?? null,
      isPublished: payload.isPublished ?? true,
    },
  });
};

const updateBook = async (
  bookId: string,
  payload: { title?: string; author?: string | null; description?: string | null; cefrLevel?: string | null },
) => {
  return prisma.readingBook.update({
    where: { id: bookId },
    data: {
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.author !== undefined ? { author: payload.author } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.cefrLevel !== undefined ? { cefrLevel: payload.cefrLevel } : {}),
    },
  });
};

const deleteBook = async (bookId: string) => {
  await prisma.readingBook.delete({ where: { id: bookId } });
};

const addToShelf = async (userId: string, bookId: string) => {
  await prisma.readingShelf.upsert({
    where: { userId_bookId: { userId, bookId } },
    update: {},
    create: { id: randomUUID(), userId, bookId },
  });
};

const removeFromShelf = async (userId: string, bookId: string) => {
  await prisma.readingShelf.delete({
    where: { userId_bookId: { userId, bookId } },
  });
};

const getShelf = async (userId: string) => {
  const entries = await prisma.readingShelf.findMany({
    where: { userId },
    include: { book: true },
    orderBy: { createdAt: 'desc' },
  });
  const progressEntries = await prisma.readingProgress.findMany({
    where: { userId, bookId: { in: entries.map((entry) => entry.bookId) } },
    select: { bookId: true, position: true, progress: true, updatedAt: true },
  });
  const progressMap = new Map(progressEntries.map((entry) => [entry.bookId, entry]));

  return entries.map((entry) => ({
    ...entry.book,
    inShelf: true,
    progress: progressMap.get(entry.bookId) ?? null,
  }));
};

const updateProgress = async (
  userId: string,
  payload: { bookId: string; position?: number; progress?: number },
) => {
  const position = payload.position ?? 0;
  const progress = payload.progress ?? 0;
  return prisma.readingProgress.upsert({
    where: { userId_bookId: { userId, bookId: payload.bookId } },
    update: { position, progress },
    create: {
      id: randomUUID(),
      userId,
      bookId: payload.bookId,
      position,
      progress,
    },
  });
};

const getProgress = async (userId: string, bookId: string) => {
  return prisma.readingProgress.findUnique({
    where: { userId_bookId: { userId, bookId } },
    select: { position: true, progress: true, updatedAt: true },
  });
};

const getReaderPreferences = async (userId: string) => {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { readerFontSize: true },
  });
  return { readerFontSize: pref?.readerFontSize ?? 18 };
};

const updateReaderPreferences = async (userId: string, readerFontSize: number) => {
  await prisma.userPreference.upsert({
    where: { userId },
    update: { readerFontSize },
    create: {
      id: randomUUID(),
      userId,
      theme: 'light',
      readerFontSize,
    },
  });
  return { readerFontSize };
};

const uploadBookFromFb2 = async (
  _file: { buffer: Buffer; originalname: string },
  _options: UploadOptions,
) => {
  throw new Error('Book upload is disabled on this backend.');
};

export const readingService = {
  listBooks,
  getBook,
  createBook,
  updateBook,
  deleteBook,
  addToShelf,
  removeFromShelf,
  getShelf,
  updateProgress,
  getProgress,
  getReaderPreferences,
  updateReaderPreferences,
  uploadBookFromFb2,
};
