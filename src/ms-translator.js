/**
 * Microsoft Free Translation Service.
 *
 * Uses the same free Edge Translate API as EasyOriginals' reader.js.
 * No API key required - gets a JWT from edge.microsoft.com/translate/auth
 * and uses it with api.cognitive.microsofttranslator.com.
 *
 * Token is cached for 8 minutes (valid for ~10 minutes).
 * Paragraphs are batched (up to 25 per API call) to minimize round-trips.
 * AbortController is used for immediate cancellation of in-flight requests.
 */

import { splitParagraphs, isSkipParagraph, parseHeading } from './paragraph-utils.js';
import { googleTranslateBatch } from './google-translator.js';

const MS_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const MS_TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate';
const BATCH_SIZE = 25; // Microsoft API limit per request
const BATCH_INTERVAL_MS = 350; // pause between batch calls to stay under the rate limit

let _cachedToken = null;
let _tokenExpiry = 0;
let _cancelled = false;
let _abortController = null;

/**
 * Get a Microsoft Translate auth token, using cache when valid.
 * @param {Function} fetchFn - Fetch implementation (for testing).
 * @returns {Promise<string>} JWT token.
 */
export async function msGetAuthToken(fetchFn = fetch) {
  if (_cachedToken && Date.now() < _tokenExpiry) {
    return _cachedToken;
  }

  const signal = _abortController?.signal;
  const resp = await fetchFn(MS_AUTH_URL, signal ? { signal } : undefined);
  if (!resp.ok) throw new Error(`Microsoft auth error: ${resp.status}`);

  const token = await resp.text();
  _cachedToken = token;
  _tokenExpiry = Date.now() + 8 * 60 * 1000;
  return token;
}

/**
 * Translate a single text string.
 * @param {string} text - Text to translate.
 * @param {string} from - Source language code (e.g. 'en').
 * @param {string} to - Target language code (e.g. 'zh-Hans').
 * @param {Function} fetchFn - Fetch implementation (for testing).
 * @returns {Promise<string>} Translated text.
 */
export async function translateText(text, from, to, fetchFn = fetch) {
  const results = await translateBatch([text], from, to, fetchFn);
  return results[0];
}

/**
 * Translate an array of text strings in a single API call.
 * @param {string[]} texts - Array of texts to translate (max 25).
 * @param {string} from - Source language code.
 * @param {string} to - Target language code.
 * @param {Function} fetchFn - Fetch implementation (for testing).
 * @param {object} [opts]
 * @param {number} [opts.maxRetries] - Retry attempts after the first try.
 * @param {Function} [opts.onWait] - Called (seconds, attempt) before a retry wait.
 * @param {number[]} [opts.rateLimitDelays] - Override 429 backoff (ms), for tests.
 * @returns {Promise<string[]>} Translated texts in same order.
 */
const MAX_RETRIES = 5;
// 429 means the free endpoint is rate-limiting us — it typically needs tens
// of seconds to clear, far longer than transient 5xx/401 hiccups.
const RATE_LIMIT_DELAYS = [5000, 15000, 30000, 60000, 90000];
const TRANSIENT_DELAYS = [1000, 3000, 5000, 10000, 15000];
const MAX_RETRY_AFTER_MS = 120000;

/** Sleep that rejects immediately when the current translation is cancelled. */
function abortableSleep(ms) {
  return new Promise((resolve, reject) => {
    const signal = _abortController?.signal;
    const abortErr = () => { const e = new Error('Translation cancelled'); e.name = 'AbortError'; return e; };
    if (signal?.aborted) return reject(abortErr());
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { cleanup(); reject(abortErr()); };
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); };
    signal?.addEventListener('abort', onAbort);
  });
}

export async function translateBatch(texts, from, to, fetchFn = fetch, opts = {}) {
  if (texts.length === 0) return [];
  const maxRetries = opts.maxRetries ?? MAX_RETRIES;
  const rateLimitDelays = opts.rateLimitDelays ?? RATE_LIMIT_DELAYS;

  const transientDelayFor = (attempt) => TRANSIENT_DELAYS[attempt] ?? TRANSIENT_DELAYS[TRANSIENT_DELAYS.length - 1];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const signal = _abortController?.signal;
    if (signal?.aborted) {
      const e = new Error('Translation cancelled'); e.name = 'AbortError'; throw e;
    }

    let resp;
    try {
      const token = await msGetAuthToken(fetchFn);
      const params = new URLSearchParams({ 'api-version': '3.0', to });
      if (from && from !== 'auto') {
        params.set('from', from);
      }
      resp = await fetchFn(`${MS_TRANSLATE_URL}?${params.toString()}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(texts.map(t => ({ Text: t }))),
        ...(signal ? { signal } : {}),
      });
    } catch (err) {
      // Network failure (offline, DNS, connection reset, aborted) — retry
      // like any other transient error instead of bypassing the retry loop.
      if (err.name === 'AbortError') throw err;
      if (attempt === maxRetries) throw new Error(`Microsoft Translate network error: ${err.message}`);
      await abortableSleep(transientDelayFor(attempt));
      continue;
    }

    if (resp.ok) {
      const data = await resp.json();
      // A short/malformed array would otherwise silently drop translations
      // (chapter reconstruction inserts `undefined` for the missing ones).
      if (!Array.isArray(data) || data.length !== texts.length) {
        throw new Error(`Microsoft Translate error: expected ${texts.length} translations, got ${Array.isArray(data) ? data.length : typeof data}`);
      }
      return data.map((item, i) => {
        if (item?.translations?.[0]?.text) return item.translations[0].text;
        throw new Error(`Unexpected response for text ${i}`);
      });
    }

    // Microsoft rate-limited us — switch to Google's free endpoint for this
    // batch instead of waiting out the (often long) limit window.
    if (resp.status === 429 && opts.noGoogleFallback !== true) {
      try {
        const result = await googleTranslateBatch(texts, from, to, opts.googleFetchFn || fetchFn);
        if (opts.onFallback) opts.onFallback('google');
        return result;
      } catch { /* Google unreachable — fall through to normal MS retries */ }
    }

    // Retry on 401 (token expired), 429 (rate limit), 5xx (server error)
    const retryable = resp.status === 401 || resp.status === 429 || resp.status >= 500;
    if (!retryable || attempt === maxRetries) {
      throw new Error(resp.status === 429
        ? 'Microsoft Translate error: 429 — 翻译服务限流，已自动重试多次。进度已保存，请几分钟后再点 Translate 继续。'
        : `Microsoft Translate error: ${resp.status}`);
    }

    // Clear token cache on 401 so next attempt gets a fresh token
    if (resp.status === 401) _clearTokenCache();

    let delay;
    if (resp.status === 429) {
      // Honor the server's Retry-After (seconds) when present
      const retryAfter = Number(resp.headers?.get?.('retry-after'));
      delay = retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
        : (rateLimitDelays[attempt] ?? rateLimitDelays[rateLimitDelays.length - 1]);
      if (opts.onWait) opts.onWait(Math.round(delay / 1000), attempt + 1);
    } else {
      delay = TRANSIENT_DELAYS[attempt] ?? TRANSIENT_DELAYS[TRANSIENT_DELAYS.length - 1];
    }
    await abortableSleep(delay);
  }
}

/**
 * Translate an arbitrary list of texts, chunked to the API batch limit,
 * with the same pacing/backoff as chapter translation.
 *
 * @param {string[]} texts
 * @param {string} from - Source language ('auto' allowed).
 * @param {string} to - Target language.
 * @param {object} [opts] - { fetchFn, onWait, onChunk(done,total) }
 * @returns {Promise<string[]>} translations, same order as texts.
 */
export async function translateTexts(texts, from, to, opts = {}) {
  const { fetchFn = fetch, onWait, onChunk, onFallback } = opts;
  _cancelled = false;
  _abortController = new AbortController();
  try {
    const out = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      if (_cancelled) throw new Error('Translation cancelled');
      if (i > 0) await abortableSleep(BATCH_INTERVAL_MS);
      const chunk = await translateBatch(texts.slice(i, i + BATCH_SIZE), from, to, fetchFn, { onWait, onFallback });
      out.push(...chunk);
      if (onChunk) onChunk(Math.min(i + BATCH_SIZE, texts.length), texts.length);
    }
    _abortController = null;
    return out;
  } catch (err) {
    if (_cancelled || err.name === 'AbortError') throw new Error('Translation cancelled');
    throw err;
  }
}

// shouldSkipParagraph aliased from shared utility
const shouldSkipParagraph = isSkipParagraph;

/**
 * Translate a full markdown chapter in batches.
 * Headings, images, and rules are preserved untranslated.
 * Supports resumption via startIndex/existingTranslations.
 *
 * @param {string} markdown - Chapter markdown text.
 * @param {string} from - Source language code.
 * @param {string} to - Target language code.
 * @param {object} options
 * @param {Function} [options.fetchFn] - Fetch implementation.
 * @param {Function} [options.onProgress] - Progress callback(current, total).
 * @param {number} [options.startIndex=0] - Paragraph index to resume from.
 * @param {string[]} [options.existingTranslations=[]] - Already-translated paragraphs.
 * @param {Function} [options.onCheckpoint] - Called after each batch with checkpoint data.
 * @returns {Promise<string>} Translated markdown.
 */
export async function translateChapter(markdown, from, to, options = {}) {
  _cancelled = false;
  _abortController = new AbortController();
  try {

  const {
    fetchFn = fetch,
    onProgress,
    onStatus,
    startIndex = 0,
    existingTranslations = [],
    onCheckpoint,
  } = options;

  const paragraphs = splitParagraphs(markdown);
  const total = paragraphs.filter(p => !shouldSkipParagraph(p)).length;
  const translated = [...existingTranslations];
  let progress = existingTranslations.filter(
    (_, i) => i < paragraphs.length && !shouldSkipParagraph(paragraphs[i])
  ).length;

  // Build ordered list of paragraph entries: translatable ones (including
  // headings) get batched, purely structural items (images, rules) are skipped.
  const entries = []; // { type: 'skip'|'translate', paraIndex, text, headingPrefix? }
  for (let i = startIndex; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    if (shouldSkipParagraph(para)) {
      entries.push({ type: 'skip', paraIndex: i, text: para });
    } else {
      const heading = parseHeading(para);
      if (heading) {
        // Translate heading text, re-attach # prefix during reconstruction
        entries.push({ type: 'translate', paraIndex: i, text: heading.text, headingPrefix: heading.prefix });
      } else {
        entries.push({ type: 'translate', paraIndex: i, text: para.trim() });
      }
    }
  }

  // Process in batches — only translatable entries go to the API
  let batchTexts = [];
  let batchEntryIndices = [];

  let firstFlush = true;

  async function flushCurrentBatch(lastParaIndex) {
    if (batchTexts.length === 0) return;
    if (!firstFlush) await abortableSleep(BATCH_INTERVAL_MS);
    firstFlush = false;
    const results = await translateBatch(batchTexts, from, to, fetchFn, {
      onWait: (seconds, attempt) => {
        if (onStatus) onStatus(`⏳ 翻译服务限流 (429)，${seconds} 秒后自动重试（第 ${attempt} 次）— 进度不会丢失`);
      },
      onFallback: () => {
        if (onStatus) onStatus('⚡ 微软翻译限流 — 已自动切换 Google 翻译继续');
      },
    });
    for (let r = 0; r < results.length; r++) {
      entries[batchEntryIndices[r]].result = results[r];
      progress++;
      if (onProgress) onProgress(progress, total);
    }
    batchTexts = [];
    batchEntryIndices = [];
    if (onCheckpoint) {
      // Build checkpoint from completed entries so it reflects actual progress
      const cpParas = [...existingTranslations];
      for (const entry of entries) {
        if (entry.result !== undefined) {
          cpParas.push(entry.headingPrefix ? `${entry.headingPrefix} ${entry.result}` : entry.result);
        } else if (entry.type === 'skip') {
          cpParas.push(entry.text);
        } else {
          break; // Stop at first untranslated entry
        }
      }
      onCheckpoint({ completedIndex: lastParaIndex + 1, translatedParagraphs: cpParas, totalParagraphs: paragraphs.length });
    }
  }

  for (let e = 0; e < entries.length; e++) {
    if (_cancelled) throw new Error('Translation cancelled');
    const entry = entries[e];

    if (entry.type === 'skip') continue;

    batchTexts.push(entry.text);
    batchEntryIndices.push(e);

    if (batchTexts.length >= BATCH_SIZE) {
      await flushCurrentBatch(entry.paraIndex);
    }
  }

  // Flush any remaining batch
  if (batchTexts.length > 0) {
    if (_cancelled) throw new Error('Translation cancelled');
    await flushCurrentBatch(entries[entries.length - 1].paraIndex);
  }

  // Reconstruct output in paragraph order, re-attaching heading prefixes
  for (const entry of entries) {
    if (entry.type === 'skip') {
      translated.push(entry.text);
    } else if (entry.headingPrefix) {
      translated.push(`${entry.headingPrefix} ${entry.result}`);
    } else {
      translated.push(entry.result);
    }
  }

  _abortController = null;
  return translated.join('\n\n');
  } catch (err) {
    // Normalize abort/cancel errors to a consistent message
    if (_cancelled || err.name === 'AbortError') {
      throw new Error('Translation cancelled');
    }
    throw err;
  }
}

async function flushBatch(batch, from, to, fetchFn) {
  const texts = batch.map(b => b.text);
  return translateBatch(texts, from, to, fetchFn);
}

/**
 * Cancel an in-progress translation, aborting in-flight requests.
 */
export function cancelTranslation() {
  _cancelled = true;
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
}

/**
 * Reset cancellation state.
 */
export function resetTranslationState() {
  _cancelled = false;
}

/**
 * Clear the cached auth token (for testing).
 */
export function _clearTokenCache() {
  _cachedToken = null;
  _tokenExpiry = 0;
}
