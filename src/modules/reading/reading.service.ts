import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EPub } from 'epub2';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cheerio = require('cheerio');
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
};

type ChapterInfo = {
  id: string;
  title: string;
  file: string;
  wordCount: number;
};

type BookManifest = {
  id: string;
  title: string;
  author?: string;
  language: string;
  wordCount: number;
  coverUrl?: string;
  chapters: ChapterInfo[];
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
      wordCount: payload.wordCount ?? null,
      isPublished: payload.isPublished ?? true,
    },
  });
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

const loadEpub = (filePath: string): Promise<EPub> =>
  new Promise((resolve, reject) => {
    const epub = new EPub(filePath);
    epub.on('error', (err: Error) => reject(err));
    epub.on('end', () => resolve(epub));
    epub.parse();
  });

const normalizeText = (value: string): string =>
  value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

const extractParagraphs = (html: string): string[] => {
  const normalizedHtml = html.replace(/<br\s*\/?>(\s*)/gi, '\n');
  const $ = cheerio.load(normalizedHtml);
  const paragraphs: string[] = [];

  $('p').each((_: number, el: unknown) => {
    const text = normalizeText($(el as any).text());
    if (text.length > 0) paragraphs.push(text);
  });

  if (paragraphs.length > 0) return paragraphs;

  const bodyText = $('body').text() || $.root().text();
  const split = bodyText
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((chunk: string) => normalizeText(chunk))
    .filter(Boolean);

  return split.length ? split : [normalizeText(bodyText)].filter(Boolean);
};

const countWords = (paragraphs: string[]): number =>
  paragraphs.reduce((acc, p) => acc + p.split(/\s+/).filter(Boolean).length, 0);

const saveCover = async (epub: EPub, outputDir: string): Promise<string | undefined> => {
  const coverId = epub.metadata?.cover;
  if (!coverId) return undefined;

  const image = await new Promise<{ data: Buffer; mime: string } | null>((resolve) => {
    epub.getImage(coverId, (err: Error | null, data?: Buffer, mime?: string) => {
      if (err || !data || !mime) return resolve(null);
      resolve({ data, mime });
    });
  });

  if (!image) return undefined;

  const ext = image.mime === 'image/png' ? 'png' : image.mime === 'image/webp' ? 'webp' : 'jpg';
  const coverPath = path.join(outputDir, 'assets', `cover.${ext}`);
  await fs.writeFile(coverPath, image.data);
  return `assets/cover.${ext}`;
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
  if (ext === '.epub') return 'application/epub+zip';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.txt') return 'text/plain';
  return 'application/octet-stream';
};

const uploadBookFromEpub = async (file: { buffer: Buffer; originalname: string }, options: UploadOptions) => {
  const env = storageConfig();
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'reading-'));
  const inputPath = path.join(tmpBase, file.originalname);
  await fs.writeFile(inputPath, file.buffer);

  const epub = await loadEpub(inputPath);
  const title = options.title?.trim() || epub.metadata?.title?.trim() || 'Untitled';
  const author = options.author?.trim() || epub.metadata?.creator?.trim() || undefined;
  const language = options.language?.trim() || 'en';

  let bookId = slugify(title);
  const existing = await prisma.readingBook.findUnique({ where: { id: bookId } });
  if (existing) {
    bookId = `${bookId}-${Date.now().toString(36)}`;
  }

  const baseDir = path.join(tmpBase, bookId);
  const originalDir = path.join(baseDir, 'original');
  const processedDir = path.join(baseDir, 'processed');
  const chaptersDir = path.join(processedDir, 'chapters');
  const assetsDir = path.join(baseDir, 'assets');

  await ensureDir(originalDir);
  await ensureDir(chaptersDir);
  await ensureDir(assetsDir);

  await fs.copyFile(inputPath, path.join(originalDir, 'source.epub'));

  const coverPath = await saveCover(epub, baseDir);

  const chapters: ChapterInfo[] = [];
  let totalWords = 0;

  for (let i = 0; i < epub.flow.length; i += 1) {
    const item = epub.flow[i];
    if (!item?.id) continue;

    const html = await new Promise<string>((resolve, reject) => {
      epub.getChapter(item.id!, (err: Error | null, text?: string) => {
        if (err || !text) return reject(err || new Error('Empty chapter'));
        resolve(text);
      });
    }).catch(() => '');

    const paragraphs = extractParagraphs(html);
    const wordCount = countWords(paragraphs);
    totalWords += wordCount;

    const chapterId = `c${i + 1}`;
    const chapterFile = `chapters/${chapterId}.json`;
    const chapterTitle = (item.title || `Chapter ${i + 1}`).trim();

    await fs.writeFile(
      path.join(processedDir, chapterFile),
      JSON.stringify({ id: chapterId, title: chapterTitle, paragraphs, wordCount }, null, 2),
      'utf8',
    );

    chapters.push({ id: chapterId, title: chapterTitle, file: chapterFile, wordCount });
  }

  const manifest: BookManifest = {
    id: bookId,
    title,
    author,
    language,
    wordCount: totalWords,
    coverUrl: coverPath,
    chapters,
  };

  await fs.writeFile(path.join(processedDir, 'book.json'), JSON.stringify(manifest, null, 2), 'utf8');

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
  const fileUrl = `${env.cdnBaseUrl}/${baseKey}/processed/book.json`;

  const book = await prisma.readingBook.create({
    data: {
      id: bookId,
      title,
      author: author ?? null,
      description: options.description?.trim() ?? null,
      coverUrl,
      fileUrl,
      language,
      wordCount: totalWords,
      isPublished: true,
    },
  });

  return book;
};

export const readingService = {
  listBooks,
  getBook,
  createBook,
  addToShelf,
  removeFromShelf,
  getShelf,
  updateProgress,
  getProgress,
  getReaderPreferences,
  updateReaderPreferences,
  uploadBookFromEpub,
};
