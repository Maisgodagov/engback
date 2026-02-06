import type { Request, Response } from "express";
import { execFile } from "node:child_process";
import { Blob } from "node:buffer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { parseTelegramInitData } from "../auth/auth.service";
import { muellerService } from "../mueller/mueller.service";
import { videoLearningService } from "../video-learning/videoLearning.service";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? "https://app.slothary.ru";
const TELEGRAM_BOT_USERNAME =
  process.env.TELEGRAM_BOT_USERNAME ?? "slothary_bot";
const TELEGRAM_WEBAPP_SHORT_NAME =
  process.env.TELEGRAM_WEBAPP_SHORT_NAME ?? "slothary";
const TELEGRAM_USE_WEB_APP_BUTTON =
  process.env.TELEGRAM_USE_WEB_APP_BUTTON === "true";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

type ShareRequestBody = {
  initData: string;
  word: string;
  translation?: string;
  extraTranslations?: string[];
  synonyms?: string[];
  videoUrl?: string;
  startSeconds?: number;
  endSeconds?: number;
  exampleText?: string;
  exampleIndex?: number;
  examplesTotal?: number;
};

type SharePhraseRequestBody = {
  initData: string;
  phrase: string;
  translation?: string;
  videoUrl?: string;
  startSeconds?: number;
  endSeconds?: number;
  exampleText?: string;
  exampleIndex?: number;
  examplesTotal?: number;
};

const safeList = (value?: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const highlightWord = (text: string, word: string) => {
  const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b(${escapedWord})\\b`, "gi");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const parts: string[] = [];
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      parts.push(escapeHtml(before));
    }
    parts.push(`<u><b><i>${escapeHtml(match[0])}</i></b></u>`);
    lastIndex = match.index + match[0].length;
  }
  const rest = text.slice(lastIndex);
  if (rest) {
    parts.push(escapeHtml(rest));
  }
  return parts.join("");
};

const buildCaption = (
  word: string,
  translation: string,
  extraTranslations: string[],
  synonyms: string[],
  exampleText?: string,
  exampleIndex?: number,
  examplesTotal?: number,
) => {
  const lines: string[] = [];
  const safeTranslation = translation || "слово";
  lines.push(`🇬🇧 <b>${word}</b> — 🇷🇺 <b>${safeTranslation}</b>`);
  if (extraTranslations.length || synonyms.length) {
    lines.push("");
  }
  if (extraTranslations.length) {
    lines.push(`<b>Другие переводы:</b> <i>${extraTranslations.join(", ")}</i>`);
  }
  if (synonyms.length) {
    lines.push("");
    lines.push(`<b>Синонимы:</b> <i>${synonyms.join(", ")}</i>`);
  }
  if (exampleText) {
    const safeIndex = 1;
    const safeTotal =
      typeof examplesTotal === "number" && examplesTotal > 0
        ? examplesTotal
        : 30;
    lines.push("");
    lines.push(`Пример использования из видео (${safeIndex}/${safeTotal}):`);
    lines.push(`<blockquote>“${exampleText}”</blockquote>`);
  }
  return lines.join("\n");
};

const buildWebAppUrl = (word: string) => {
  const safeWord = word.trim().toLowerCase();
  const payloadBase = safeWord
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  const payload = `word_${payloadBase || "share"}`;
  const params = safeWord
    ? new URLSearchParams({ startapp: payload, word: safeWord })
    : new URLSearchParams();
  if (TELEGRAM_WEBAPP_SHORT_NAME) {
    const query = params.toString();
    return `https://t.me/${TELEGRAM_BOT_USERNAME}/${TELEGRAM_WEBAPP_SHORT_NAME}${
      query ? `?${query}` : ""
    }`;
  }
  const query = params.toString();
  return `${APP_PUBLIC_URL}/#/dictionary${query ? `?${query}` : ""}`;
};

const buildWebAppUrlForPhrase = (phrase: string) => {
  const safePhrase = phrase.trim().toLowerCase();
  const payload = `phrase_${safePhrase.slice(0, 48)}`;
  const params = safePhrase
    ? new URLSearchParams({ startapp: payload, phrase: safePhrase })
    : new URLSearchParams();
  if (TELEGRAM_WEBAPP_SHORT_NAME) {
    const query = params.toString();
    return `https://t.me/${TELEGRAM_BOT_USERNAME}/${TELEGRAM_WEBAPP_SHORT_NAME}${
      query ? `?${query}` : ""
    }`;
  }
  const query = params.toString();
  return `${APP_PUBLIC_URL}/#/dictionary${query ? `?${query}` : ""}`;
};

const highlightPhrase = (text: string, phrase: string) => {
  const tokens = phrase
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/['’]/g, ""))
    .filter(Boolean);
  if (!tokens.length) return escapeHtml(text);
  const tokenPattern = tokens
    .map((token) =>
      token
        .split("")
        .map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("['’]?")
    )
    .map((part) => `\\b${part}\\b`)
    .join("\\s+");
  const regex = new RegExp(tokenPattern, "gi");
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const parts: string[] = [];
  while ((match = regex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      parts.push(escapeHtml(before));
    }
    parts.push(`<u><b><i>${escapeHtml(match[0])}</i></b></u>`);
    lastIndex = match.index + match[0].length;
  }
  const rest = text.slice(lastIndex);
  if (rest) {
    parts.push(escapeHtml(rest));
  }
  return parts.join("");
};

const telegramApi = async (method: string, payload: Record<string, unknown>) => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw Object.assign(new Error("Missing TELEGRAM_BOT_TOKEN"), { status: 500 });
  }
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;
  if (!response.ok || !data?.ok) {
    const description =
      typeof data?.description === "string"
        ? data.description
        : `Telegram API error: ${response.status}`;
    throw Object.assign(new Error(description), { status: 502 });
  }
  return data;
};

const isDirectVideoUrl = (url: string) => /\.(mp4|mov|m4v)(\?|#|$)/i.test(url);
const isHlsUrl = (url: string) => /\.m3u8(\?|#|$)/i.test(url);
const execFileAsync = promisify(execFile);

const formatSeconds = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, value);
};

const generateMp4Clip = async (sourceUrl: string, start?: number, end?: number) => {
  const safeStart = formatSeconds(start);
  const safeEnd = formatSeconds(end);
  const duration = Math.max(1, Math.min(6, safeEnd > safeStart ? safeEnd - safeStart : 4));
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "slothary-clip-"));
  const outputPath = path.join(tmpDir, `clip-${Date.now()}.mp4`);

  const args = [
    "-y",
    "-protocol_whitelist",
    "file,crypto,data,https,tcp,tls",
    "-user_agent",
    "Mozilla/5.0",
    "-i",
    sourceUrl,
    "-ss",
    safeStart.toFixed(2),
    "-t",
    duration.toFixed(2),
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.0",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    outputPath,
  ];

  const { stderr } = await execFileAsync("ffmpeg", args, {
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr) {
  }
  const stat = await fs.stat(outputPath);
  if (!stat.size || stat.size < 50_000) {
    throw new Error(`Generated clip is too small (${stat.size} bytes)`);
  }
  const buffer = await fs.readFile(outputPath);
  await fs.rm(tmpDir, { recursive: true, force: true });
  return buffer;
};

const generateVideoNoteClip = async (
  sourceUrl: string,
  start?: number,
  end?: number,
) => {
  const safeStart = formatSeconds(start);
  const safeEnd = formatSeconds(end);
  const duration = Math.max(1, Math.min(6, safeEnd > safeStart ? safeEnd - safeStart : 4));
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "slothary-note-"));
  const outputPath = path.join(tmpDir, `note-${Date.now()}.mp4`);

  const args = [
    "-y",
    "-protocol_whitelist",
    "file,crypto,data,https,tcp,tls",
    "-user_agent",
    "Mozilla/5.0",
    "-i",
    sourceUrl,
    "-ss",
    safeStart.toFixed(2),
    "-t",
    duration.toFixed(2),
    "-vf",
    "scale='min(iw,ih)':-1,crop='min(iw,ih)':'min(iw,ih)',scale=512:512",
    "-c:v",
    "libx264",
    "-profile:v",
    "baseline",
    "-level",
    "3.0",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    "28",
    "-c:a",
    "aac",
    "-ar",
    "44100",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    outputPath,
  ];

  const { stderr } = await execFileAsync("ffmpeg", args, {
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stderr) {
  }
  const stat = await fs.stat(outputPath);
  if (!stat.size || stat.size < 50_000) {
    throw new Error(`Generated video note is too small (${stat.size} bytes)`);
  }
  const buffer = await fs.readFile(outputPath);
  await fs.rm(tmpDir, { recursive: true, force: true });
  return buffer;
};

const sendTelegramVideoFile = async (
  chatId: string,
  caption: string,
  replyMarkup: Record<string, unknown>,
  fileBuffer: Buffer,
) => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw Object.assign(new Error("Missing TELEGRAM_BOT_TOKEN"), { status: 500 });
  }
  const FormDataCtor = (globalThis as any).FormData;
  if (!FormDataCtor) {
    throw Object.assign(new Error("FormData is not available in this Node runtime"), {
      status: 500,
    });
  }
  const form = new FormDataCtor();
  form.append("chat_id", chatId);
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("supports_streaming", "true");
  form.append("reply_markup", JSON.stringify(replyMarkup));
  const blob = new Blob([fileBuffer], { type: "video/mp4" });
  form.append("video", blob, "clip.mp4");

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`,
    {
      method: "POST",
      body: form,
    },
  );
  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;
  if (!response.ok || !data?.ok) {
    const description =
      typeof data?.description === "string"
        ? data.description
        : `Telegram API error: ${response.status}`;
    throw Object.assign(new Error(description), { status: 502 });
  }
};

const sendTelegramVideoNoteFile = async (
  chatId: string,
  replyMarkup: Record<string, unknown>,
  fileBuffer: Buffer,
) => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw Object.assign(new Error("Missing TELEGRAM_BOT_TOKEN"), { status: 500 });
  }
  const FormDataCtor = (globalThis as any).FormData;
  if (!FormDataCtor) {
    throw Object.assign(new Error("FormData is not available in this Node runtime"), {
      status: 500,
    });
  }
  const form = new FormDataCtor();
  form.append("chat_id", chatId);
  form.append("reply_markup", JSON.stringify(replyMarkup));
  const blob = new Blob([fileBuffer], { type: "video/mp4" });
  form.append("video_note", blob, "note.mp4");

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideoNote`,
    {
      method: "POST",
      body: form,
    },
  );
  const data = (await response.json().catch(() => null)) as
    | { ok?: boolean; description?: string }
    | null;
  if (!response.ok || !data?.ok) {
    const description =
      typeof data?.description === "string"
        ? data.description
        : `Telegram API error: ${response.status}`;
    throw Object.assign(new Error(description), { status: 502 });
  }
};

export const sendWordShare = async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<ShareRequestBody>;
    const initData = typeof body.initData === "string" ? body.initData : "";
    const word = typeof body.word === "string" ? body.word.trim() : "";
    if (!initData || !word) {
      res.status(400).json({ message: "Missing initData or word" });
      return;
    }

    const telegram = parseTelegramInitData(initData);

    let translation =
      typeof body.translation === "string" ? body.translation.trim() : "";
    let extraTranslations = safeList(body.extraTranslations);
    let synonyms = safeList(body.synonyms);

    if (!translation || (!extraTranslations.length && !synonyms.length)) {
      const entries = await muellerService.lookup(word, "en");
      const primary = entries[0];
      const translations = (primary?.translations ?? []).filter(Boolean);
      if (!translation) translation = translations[0] ?? "";
      if (!extraTranslations.length) {
        extraTranslations = translations
          .filter((value) => value && value !== translation)
          .slice(0, 4);
      }
      if (!synonyms.length) {
        synonyms = (primary?.synonyms ?? []).slice(0, 4);
      }
    }

    let videoUrl =
      typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
    if (!videoUrl) {
      try {
        const snippetResult = await videoLearningService.searchPhrase(
          word,
          1,
          1,
          undefined,
          1,
        );
        const first = snippetResult.items?.[0];
        if (first?.videoUrl) {
          videoUrl = first.videoUrl;
        }
      } catch {
        // ignore snippet errors
      }
    }
    let startSeconds =
      typeof body.startSeconds === "number" ? body.startSeconds : undefined;
    let endSeconds =
      typeof body.endSeconds === "number" ? body.endSeconds : undefined;

    if (videoUrl && isHlsUrl(videoUrl) && startSeconds === undefined) {
      try {
        const snippetResult = await videoLearningService.searchPhrase(
          word,
          1,
          1,
          undefined,
          1,
        );
        const first = snippetResult.items?.[0];
        if (first?.videoUrl) {
          videoUrl = first.videoUrl;
        }
        if (typeof first?.startSeconds === "number") {
          startSeconds = first.startSeconds;
        }
        if (typeof first?.endSeconds === "number") {
          endSeconds = first.endSeconds;
        }
      } catch (timingError: any) {
        console.error("[share] failed to fetch snippet timings", {
          message: timingError?.message,
        });
      }
    }

    const rawExample =
      (typeof body.exampleText === "string" ? body.exampleText : "") || "";
    const highlightedExample = rawExample ? highlightWord(rawExample, word) : "";

    const caption = buildCaption(
      escapeHtml(word.toUpperCase()),
      escapeHtml((translation || "слово").toUpperCase()),
      extraTranslations.map(escapeHtml),
      synonyms.map(escapeHtml),
      highlightedExample,
      body.exampleIndex,
      body.examplesTotal,
    );
    const webAppUrl = buildWebAppUrl(word);

    const replyMarkup = TELEGRAM_USE_WEB_APP_BUTTON
      ? {
          inline_keyboard: [
            [
              {
                text: "Open Slothary",
                web_app: { url: webAppUrl },
              },
            ],
          ],
        }
      : {
          inline_keyboard: [
            [
              {
                text: `Еще ${
                  Math.max(
                    (typeof body.examplesTotal === "number" && body.examplesTotal > 0
                      ? body.examplesTotal
                      : 30) - 1,
                    0,
                  )
                } примеров в Slothary`,
                url: webAppUrl,
              },
            ],
          ],
        };

    if (videoUrl && isDirectVideoUrl(videoUrl)) {
      await telegramApi("sendVideo", {
        chat_id: telegram.id,
        video: videoUrl,
        caption,
        parse_mode: "HTML",
        supports_streaming: true,
        reply_markup: replyMarkup,
      });
      res.json({ ok: true, mode: "video-url" });
      return;
    }

    if (videoUrl && isHlsUrl(videoUrl) && startSeconds !== undefined) {
      try {
        const buffer = await generateMp4Clip(
          videoUrl,
          startSeconds,
          endSeconds,
        );
        await sendTelegramVideoFile(telegram.id, caption, replyMarkup, buffer);
        res.json({ ok: true, mode: "video-clip" });
        return;
      } catch (clipError: any) {
        console.error("[share] clip generation failed", {
          message: clipError?.message,
        });
      }
    }

    if (videoUrl) {
      // unsupported video url, fallback to text
    }
    {
      await telegramApi("sendMessage", {
        chat_id: telegram.id,
        text: caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      res.json({ ok: true, mode: "text" });
      return;
    }

    res.json({ ok: true, mode: "text" });
  } catch (error: any) {
    console.error("[share] sendWordShare error", {
      message: error?.message,
      status: error?.status,
    });
    const status = Number(error?.status ?? 500);
    res.status(status).json({ message: error?.message ?? "Share failed" });
  }
};

export const sendPhraseShare = async (req: Request, res: Response) => {
  try {
    const body = req.body as Partial<SharePhraseRequestBody>;
    const initData = typeof body.initData === "string" ? body.initData : "";
    const phrase = typeof body.phrase === "string" ? body.phrase.trim() : "";
    if (!initData || !phrase) {
      res.status(400).json({ message: "Missing initData or phrase" });
      return;
    }

    const telegram = parseTelegramInitData(initData);

    const translation =
      typeof body.translation === "string" ? body.translation.trim() : "";

    let videoUrl =
      typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
    if (!videoUrl) {
      try {
        const snippetResult = await videoLearningService.searchPhrase(
          phrase,
          1,
          1,
          undefined,
          1,
        );
        const first = snippetResult.items?.[0];
        if (first?.videoUrl) {
          videoUrl = first.videoUrl;
        }
      } catch {
        // ignore snippet errors
      }
    }
    let startSeconds =
      typeof body.startSeconds === "number" ? body.startSeconds : undefined;
    let endSeconds =
      typeof body.endSeconds === "number" ? body.endSeconds : undefined;

    if (videoUrl && isHlsUrl(videoUrl) && startSeconds === undefined) {
      try {
        const snippetResult = await videoLearningService.searchPhrase(
          phrase,
          1,
          1,
          undefined,
          1,
        );
        const first = snippetResult.items?.[0];
        if (first?.videoUrl) {
          videoUrl = first.videoUrl;
        }
        if (typeof first?.startSeconds === "number") {
          startSeconds = first.startSeconds;
        }
        if (typeof first?.endSeconds === "number") {
          endSeconds = first.endSeconds;
        }
      } catch (timingError: any) {
        console.error("[share] failed to fetch snippet timings", {
          message: timingError?.message,
        });
      }
    }

    const rawExample =
      (typeof body.exampleText === "string" ? body.exampleText : "") || "";
    const highlightedExample = rawExample
      ? highlightPhrase(rawExample, phrase)
      : "";

    const caption = buildCaption(
      escapeHtml(phrase.toUpperCase()),
      escapeHtml((translation || "ФРАЗА").toUpperCase()),
      [],
      [],
      highlightedExample,
      body.exampleIndex,
      body.examplesTotal,
    );
    const webAppUrl = buildWebAppUrl(phrase);

    const replyMarkup = TELEGRAM_USE_WEB_APP_BUTTON
      ? {
          inline_keyboard: [
            [
              {
                text: "Open Slothary",
                web_app: { url: webAppUrl },
              },
            ],
          ],
        }
      : {
          inline_keyboard: [
            [
              {
                text: `Еще ${
                  Math.max(
                    (typeof body.examplesTotal === "number" && body.examplesTotal > 0
                      ? body.examplesTotal
                      : 30) - 1,
                    0,
                  )
                } примеров в Slothary`,
                url: webAppUrl,
              },
            ],
          ],
        };

    if (videoUrl && isDirectVideoUrl(videoUrl)) {
      await telegramApi("sendVideo", {
        chat_id: telegram.id,
        video: videoUrl,
        caption,
        parse_mode: "HTML",
        supports_streaming: true,
        reply_markup: replyMarkup,
      });
      res.json({ ok: true, mode: "video-url" });
      return;
    }

    if (videoUrl && isHlsUrl(videoUrl) && startSeconds !== undefined) {
      try {
        const buffer = await generateMp4Clip(
          videoUrl,
          startSeconds,
          endSeconds,
        );
        await sendTelegramVideoFile(telegram.id, caption, replyMarkup, buffer);
        res.json({ ok: true, mode: "video-clip" });
        return;
      } catch (clipError: any) {
        console.error("[share] clip generation failed", {
          message: clipError?.message,
        });
      }
    }

    if (videoUrl) {
      // unsupported video url, fallback to text
    }
    {
      await telegramApi("sendMessage", {
        chat_id: telegram.id,
        text: caption,
        parse_mode: "HTML",
        reply_markup: replyMarkup,
      });
      res.json({ ok: true, mode: "text" });
      return;
    }
  } catch (error: any) {
    console.error("[share] sendPhraseShare error", {
      message: error?.message,
      status: error?.status,
    });
    const status = Number(error?.status ?? 500);
    res.status(status).json({ message: error?.message ?? "Share failed" });
  }
};

export const sendWelcomeMessage = async (req: Request, res: Response) => {
  try {
    const initData = typeof req.body?.initData === "string" ? req.body.initData : "";
    if (!initData) {
      res.status(400).json({ message: "Missing initData" });
      return;
    }
    const telegram = parseTelegramInitData(initData);
    const text =
      "Добро пожаловать в Slothary! Здесь ты можешь учить английский по видео, " +
      "а в словаре — смотреть переводы с видео‑примерами. " +
      "Открывай веб‑приложение кнопкой ниже.";
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: "Открыть Slothary",
            url: buildWebAppUrl(""),
          },
        ],
      ],
    };
    await telegramApi("sendMessage", {
      chat_id: telegram.id,
      text,
      reply_markup: replyMarkup,
    });
    res.json({ ok: true });
  } catch (error: any) {
    const status = Number(error?.status ?? 500);
    res.status(status).json({ message: error?.message ?? "Welcome failed" });
  }
};
