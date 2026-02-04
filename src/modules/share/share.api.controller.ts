import type { Request, Response } from "express";

import { parseTelegramInitData } from "../auth/auth.service";
import { muellerService } from "../mueller/mueller.service";
import { videoLearningService } from "../video-learning/videoLearning.service";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? "https://app.slothary.ru";
const TELEGRAM_BOT_USERNAME =
  process.env.TELEGRAM_BOT_USERNAME ?? "slothary_bot";
const TELEGRAM_WEBAPP_SHORT_NAME =
  process.env.TELEGRAM_WEBAPP_SHORT_NAME ?? "";
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
};

const safeList = (value?: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
};

const buildCaption = (
  word: string,
  translation: string,
  extraTranslations: string[],
  synonyms: string[],
) => {
  const lines: string[] = [];
  lines.push(`${word} - ${translation || "word"}`);
  if (extraTranslations.length) {
    lines.push(`Other: ${extraTranslations.join(", ")}`);
  }
  if (synonyms.length) {
    lines.push(`Synonyms: ${synonyms.join(", ")}`);
  }
  return lines.join("\n");
};

const buildWebAppUrl = (word: string) => {
  const payload = `word_${word.toLowerCase().slice(0, 48)}`;
  if (TELEGRAM_WEBAPP_SHORT_NAME) {
    return `https://t.me/${TELEGRAM_BOT_USERNAME}/${TELEGRAM_WEBAPP_SHORT_NAME}?startapp=${encodeURIComponent(
      payload,
    )}`;
  }
  const params = new URLSearchParams({ startapp: payload, word: word.toLowerCase() });
  return `${APP_PUBLIC_URL}/?${params.toString()}`;
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

    const caption = buildCaption(word, translation, extraTranslations, synonyms);
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
                text: "Open Slothary",
                url: webAppUrl,
              },
            ],
          ],
        };

    if (videoUrl) {
      await telegramApi("sendVideo", {
        chat_id: telegram.id,
        video: videoUrl,
        caption,
        supports_streaming: true,
        reply_markup: replyMarkup,
      });
    } else {
      await telegramApi("sendMessage", {
        chat_id: telegram.id,
        text: caption,
        reply_markup: replyMarkup,
      });
    }

    res.json({ ok: true });
  } catch (error: any) {
    const status = Number(error?.status ?? 500);
    res.status(status).json({ message: error?.message ?? "Share failed" });
  }
};
