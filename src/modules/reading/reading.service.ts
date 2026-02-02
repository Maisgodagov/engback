import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Fb2Metadata } from '@lingo-reader/fb2-parser';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

const storageConfig = () => {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const cdnBaseUrl = process.env.CDN_BASE_URL;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey || !cdnBaseUrl) {
    throw new Error('Missing S3/CDN env configuration');
  }
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    cdnBaseUrl: cdnBaseUrl.replace(/\/$/, ''),
  };
};

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || `book-${Date.now()}`;

const resolveAuthor = (metadata?: Fb2Metadata): string | undefined => {
  const author = metadata?.author;
  if (!author) return undefined;
  if (author.name?.trim()) return author.name.trim();
  const parts = [author.firstName, author.middleName, author.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (parts) return parts;
  if (author.nickname?.trim()) return author.nickname.trim();
  return undefined;
};

const loadFb2Parser = async () => {
  const mod = await import('@lingo-reader/fb2-parser');
  return mod.initFb2File;
};

const listFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFiles(fullPath)));
    } else {
      results.push(fullPath);
    }
  }
  return results;
};

const contentTypeFor = (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.fb2') return 'application/xml';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.txt') return 'text/plain';
  return 'application/octet-stream';
};

const uploadBookFromFb2 = async (file: { buffer: Buffer; originalname: string }, options: UploadOptions) => {
  const env = storageConfig();
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'reading-'));
  const safeName = file.originalname?.trim() || 'book.fb2';
  const inputPath = path.join(tmpBase, safeName);
  await fs.writeFile(inputPath, file.buffer);

  const tempAssetsDir = path.join(tmpBase, 'assets-tmp');
  await ensureDir(tempAssetsDir);

  const initFb2File = await loadFb2Parser();
  const fb2 = await initFb2File(new Uint8Array(file.buffer), tempAssetsDir);
  const metadata = fb2.getMetadata();
  const title =
    options.title?.trim() ||
    metadata.title?.trim() ||
    metadata.bookName?.trim() ||
    'Untitled';
  const author = options.author?.trim() || resolveAuthor(metadata) || undefined;
  const language = options.language?.trim() || metadata.language?.trim() || 'en';

  let bookId = slugify(title);
  const existing = await prisma.readingBook.findUnique({ where: { id: bookId } });
  if (existing) {
    bookId = `${bookId}-${Date.now().toString(36)}`;
  }

  const baseDir = path.join(tmpBase, bookId);
  const originalDir = path.join(baseDir, 'original');
  const assetsDir = path.join(baseDir, 'assets');

  await ensureDir(originalDir);

  await fs.copyFile(inputPath, path.join(originalDir, 'source.fb2'));

  const coverFile = fb2.getCoverImage();
  let coverPath: string | undefined;
  if (coverFile) {
    const rel = path.relative(tempAssetsDir, coverFile);
    coverPath = `assets/${rel.replace(/\\/g, '/')}`;
  }
  await fs.rename(tempAssetsDir, assetsDir);
  if (typeof fb2.destroy === 'function') {
    fb2.destroy();
  }

  const s3 = new S3Client({
    endpoint: env.endpoint,
    region: env.region,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    forcePathStyle: true,
  });

  const files = await listFiles(baseDir);
  const baseKey = `books/${bookId}`;
  for (const filePath of files) {
    const rel = path.relative(baseDir, filePath).replace(/\\/g, '/');
    const key = `${baseKey}/${rel}`;
    const body = await fs.readFile(filePath);
    await s3.send(
      new PutObjectCommand({
        Bucket: env.bucket,
        Key: key,
        Body: body,
        ContentType: contentTypeFor(filePath),
        CacheControl: 'public, max-age=31536000',
      }),
    );
  }

  const coverUrl = coverPath ? `${env.cdnBaseUrl}/${baseKey}/${coverPath}` : null;
  const fileUrl = `${env.cdnBaseUrl}/${baseKey}/original/source.fb2`;

  const book = await prisma.readingBook.create({
    data: {
      id: bookId,
      title,
      author: author ?? null,
      description: options.description?.trim() ?? metadata.description?.trim() ?? null,
      coverUrl,
      fileUrl,
      language,
      cefrLevel: options.cefrLevel ?? null,
      wordCount: null,
      isPublished: true,
    },
  });

  return book;
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
