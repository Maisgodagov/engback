import type { Request, Response } from 'express';

import { muellerService } from '../mueller/mueller.service';
import { videoLearningService } from '../video-learning/videoLearning.service';

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL ?? 'https://app.slothary.ru';
const API_PUBLIC_URL = process.env.API_PUBLIC_URL ?? 'https://api.slothary.ru';
const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'slothary_bot';

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const decodeWordParam = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const pickTranslation = (candidate?: string | null, fallback?: string | null) => {
  if (candidate && candidate.trim()) return candidate.trim();
  if (fallback && fallback.trim()) return fallback.trim();
  return '';
};

const buildOgDescription = (translation: string, synonyms: string[]) => {
  const parts: string[] = [];
  if (translation) parts.push(`ѕеревод: ${translation}`);
  if (synonyms.length) parts.push(`—инонимы: ${synonyms.join(', ')}`);
  return parts.length ? parts.join(' Ј ') : ' арточка слова в Slothary.';
};

const buildImageUrl = (word: string, translation: string, synonyms: string[]) => {
  const params = new URLSearchParams();
  if (translation) params.set('translation', translation);
  if (synonyms.length) params.set('synonyms', synonyms.join(','));
  const query = params.toString();
  return `${API_PUBLIC_URL}/share/word/${encodeURIComponent(word)}/image${query ? `?${query}` : ''}`;
};

const buildShareUrl = (word: string, translation: string) => {
  const params = new URLSearchParams();
  if (translation) params.set('translation', translation);
  const query = params.toString();
  return `${API_PUBLIC_URL}/share/word/${encodeURIComponent(word)}${query ? `?${query}` : ''}`;
};

const buildBotLink = (word: string) => {
  const payload = `word_${word.toLowerCase().slice(0, 48)}`;
  return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(payload)}`;
};

const buildVideoUrl = (baseUrl: string, startSeconds?: number, endSeconds?: number) => {
  if (!startSeconds && !endSeconds) return baseUrl;
  const start = typeof startSeconds === 'number' ? Math.max(0, startSeconds) : 0;
  const end = typeof endSeconds === 'number' ? Math.max(start, endSeconds) : undefined;
  if (end !== undefined) {
    return `${baseUrl}#t=${start.toFixed(2)},${end.toFixed(2)}`;
  }
  return `${baseUrl}#t=${start.toFixed(2)}`;
};

export const renderWordShare = async (req: Request, res: Response) => {
  const rawWord = decodeWordParam(req.params.word ?? '');
  const normalizedWord = rawWord.trim();
  if (!normalizedWord) {
    res.status(404).send('Word not found');
    return;
  }

  const translationOverride = typeof req.query.translation === 'string' ? req.query.translation : '';

  const entries = await muellerService.lookup(normalizedWord, 'en');
  const primary = entries[0];
  const primaryWord = primary?.word?.trim() || normalizedWord;
  const translations = (primary?.translations ?? []).filter((value) => value && value.trim());
  const translation = pickTranslation(translationOverride, translations[0] ?? '');
  const synonyms = (primary?.synonyms ?? [])
    .filter((value) => value && value.trim())
    .filter((value) => value.toLowerCase() !== primaryWord.toLowerCase())
    .slice(0, 4);

  let snippet = null as null | {
    videoUrl: string;
    startSeconds?: number;
    endSeconds?: number;
  };

  try {
    const snippetResult = await videoLearningService.searchPhrase(primaryWord, 1, 1, undefined, 1);
    const first = snippetResult.items?.[0];
    if (first?.videoUrl) {
      snippet = {
        videoUrl: first.videoUrl,
        startSeconds: first.startSeconds,
        endSeconds: first.endSeconds,
      };
    }
  } catch {
    // ignore snippet errors
  }

  const shareUrl = buildShareUrl(primaryWord, translation);
  const imageUrl = buildImageUrl(primaryWord, translation, synonyms);
  const ogTitle = `${primaryWord} Ч ${translation || 'слово'}`;
  const ogDescription = buildOgDescription(translation, synonyms);
  const videoUrl = snippet ? buildVideoUrl(snippet.videoUrl, snippet.startSeconds, snippet.endSeconds) : '';
  const botLink = buildBotLink(primaryWord);

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(ogTitle)}</title>
<meta property="og:title" content="${escapeHtml(ogTitle)}" />
<meta property="og:description" content="${escapeHtml(ogDescription)}" />
<meta property="og:type" content="video.other" />
<meta property="og:url" content="${escapeHtml(shareUrl)}" />
<meta property="og:site_name" content="Slothary" />
<meta property="og:image" content="${escapeHtml(imageUrl)}" />
${videoUrl ? `<meta property="og:video" content="${escapeHtml(videoUrl)}" />
<meta property="og:video:secure_url" content="${escapeHtml(videoUrl)}" />
<meta property="og:video:type" content="video/mp4" />
<meta property="og:video:width" content="720" />
<meta property="og:video:height" content="1280" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />
<meta name="twitter:description" content="${escapeHtml(ogDescription)}" />
<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />
<style>
  body { margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; background: #0f111a; color: #f5f7ff; }
  .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { background: #171a27; border-radius: 20px; padding: 18px; max-width: 420px; width: 100%; box-shadow: 0 16px 40px rgba(0,0,0,.35); }
  .title { font-size: 26px; font-weight: 800; margin-bottom: 6px; }
  .title span { font-weight: 400; color: #d1d6e5; }
  .meta { font-size: 14px; color: #c1c7d6; margin-bottom: 10px; }
  .syn { font-size: 13px; color: #c1c7d6; margin-bottom: 12px; }
  .video { width: 100%; border-radius: 16px; overflow: hidden; background: #0b0d14; }
  video { width: 100%; display: block; }
  .cta { display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #2ea3ff, #6dd3ff); color: #0c1021; font-weight: 700; border: none; border-radius: 999px; padding: 10px 16px; text-decoration: none; margin-top: 14px; }
  .note { font-size: 12px; color: #8f97aa; margin-top: 10px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="title">${escapeHtml(primaryWord)}${translation ? ` <span>Ч ${escapeHtml(translation)}</span>` : ''}</div>
      ${translations.length > 1 ? `<div class="meta">${escapeHtml(translations.slice(1, 5).join(', '))}</div>` : ''}
      ${synonyms.length ? `<div class="syn"><strong>синонимы:</strong> ${escapeHtml(synonyms.join(', '))}</div>` : ''}
      ${videoUrl ? `<div class="video"><video controls playsinline preload="metadata" src="${escapeHtml(videoUrl)}"></video></div>` : ''}
      <a class="cta" href="${escapeHtml(botLink)}">—мотреть еще</a>
      <div class="note">ќткройте бота, чтобы увидеть больше примеров и тренировки.</div>
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};

export const renderWordShareImage = (req: Request, res: Response) => {
  const rawWord = decodeWordParam(req.params.word ?? '');
  const word = rawWord.trim() || 'word';
  const translation = typeof req.query.translation === 'string' ? req.query.translation : '';
  const rawSynonyms = typeof req.query.synonyms === 'string' ? req.query.synonyms : '';
  const synonyms = rawSynonyms
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 4);

  const title = escapeHtml(word.toLowerCase());
  const translationText = translation ? escapeHtml(translation) : 'слово';
  const synonymsText = synonyms.length ? escapeHtml(synonyms.join(', ')) : '¬идеопример внутри';

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f111a" />
      <stop offset="100%" stop-color="#18213a" />
    </linearGradient>
  </defs>
  <rect width="1200" height="630" rx="48" fill="url(#bg)" />
  <rect x="70" y="70" width="1060" height="490" rx="36" fill="#171a27" />
  <text x="120" y="200" font-size="64" font-family="Arial, sans-serif" font-weight="700" fill="#f5f7ff">${title}</text>
  <text x="120" y="270" font-size="36" font-family="Arial, sans-serif" font-weight="400" fill="#c1c7d6">Ч ${translationText}</text>
  <text x="120" y="340" font-size="28" font-family="Arial, sans-serif" font-weight="400" fill="#c1c7d6">${synonymsText}</text>
  <text x="120" y="460" font-size="22" font-family="Arial, sans-serif" font-weight="600" fill="#6dd3ff">Slothary Ј Watch video examples</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(svg);
};
