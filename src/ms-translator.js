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
// Set once Microsoft proves unusable this session (its free token endpoint has
// disappeared before), so later batches skip it instead of re-paying the wait.
let _msUnavailable = false;
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

/** Monotonic clock, indirected so tests need no real time to pass. */
const _now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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

  const transientDelays = opts.transientDelays ?? TRANSIENT_DELAYS;
  const transientDelayFor = (attempt) => transientDelays[attempt] ?? transientDelays[transientDelays.length - 1];

  /**
   * Translate this batch with Google instead. Returns null when Google is
   * unusable too, so callers can fall through to Microsoft's retry ladder.
   */
  const tryGoogle = async () => {
    if (opts.noGoogleFallback === true) return null;
    try {
      const result = await googleTranslateBatch(texts, from, to, opts.googleFetchFn || fetchFn);
      if (opts.onFallback) opts.onFallback('google');
      return result;
    } catch {
      return null;
    }
  };

  // Microsoft already failed outright this session. Repeating the doomed auth
  // sequence for every batch is pure latency, so go straight to Google — and if
  // Google is down too, clear the flag and give Microsoft another chance rather
  // than staying stuck on a stale verdict.
  if (_msUnavailable) {
    const viaGoogle = await tryGoogle();
    if (viaGoogle) return viaGoogle;
    _msUnavailable = false;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const signal = _abortController?.signal;
    if (signal?.aborted) {
      const e = new Error('Translation cancelled'); e.name = 'AbortError'; throw e;
    }

    let resp;
    try {
      if (_msUnavailable) throw new Error('Microsoft translate marked unavailable this session');
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
      // Microsoft is unusable: offline, DNS, connection reset — or its free
      // token endpoint has gone away, which is what actually happened
      // (edge.microsoft.com/translate/auth started answering 404 with an empty
      // body). Google needs no token, so try it before burning the retry
      // ladder. Previously this path could not reach the fallback at all: it
      // was gated on `resp.status === 429`, and a throw here never assigns
      // `resp`. The result was 34 seconds of silent retries and then failure,
      // while a working provider sat unused.
      if (err.name === 'AbortError') throw err;
      const viaGoogle = await tryGoogle();
      if (viaGoogle) {
        _msUnavailable = true;
        return viaGoogle;
      }
      if (attempt === maxRetries) throw new Error(`Microsoft Translate network error: ${err.message}`);
      const wait = transientDelayFor(attempt);
      // Never wait silently — silence is indistinguishable from a hang.
      if (opts.onWait) opts.onWait(Math.round(wait / 1000), attempt + 1, 'retry');
      await abortableSleep(wait);
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
    if (resp.status === 429) {
      const viaGoogle = await tryGoogle();
      if (viaGoogle) return viaGoogle;
      // Google unreachable — fall through to normal MS retries.
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
      delay = transientDelayFor(attempt);
      if (opts.onWait) opts.onWait(Math.round(delay / 1000), attempt + 1, 'retry');
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
 * @param {object} [opts] - { fetchFn, onWait, onChunk(done,total), onBatch(texts, translations, offset) }
 * @param {Function} [opts.onBatch] - Called after EACH successful batch with
 *   that batch's source texts, its translations, and its offset into `texts`.
 *   Callers persist here so a later batch failing never discards earlier work
 *   — without it, a 60-batch chapter failing on batch 40 threw away 39 good
 *   batches and the retry restarted from sentence 1.
 * @returns {Promise<string[]>} translations, same order as texts.
 */
export async function translateTexts(texts, from, to, opts = {}) {
  const { fetchFn = fetch, onWait, onChunk, onFallback, onBatch, onBatchTiming } = opts;
  _cancelled = false;
  _abortController = new AbortController();
  try {
    const out = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      if (_cancelled) throw new Error('Translation cancelled');
      // Pacing and network are timed apart because they have different fixes:
      // the sleep is ours to tune, the round trip is not.
      const pacingStart = _now();
      if (i > 0) await abortableSleep(BATCH_INTERVAL_MS);
      const pacingMs = _now() - pacingStart;
      const batchTexts = texts.slice(i, i + BATCH_SIZE);
      // 429 waits happen inside translateBatch, so they are subtracted out
      // rather than counted as network time.
      let rateLimitMs = 0;
      const netStart = _now();
      const chunk = await translateBatch(batchTexts, from, to, fetchFn, {
        onWait: (seconds, attempt) => {
          rateLimitMs += seconds * 1000;
          if (onWait) onWait(seconds, attempt);
        },
        onFallback,
      });
      if (onBatchTiming) {
        onBatchTiming({
          size: batchTexts.length,
          networkMs: Math.max(0, (_now() - netStart) - rateLimitMs),
          pacingMs,
          rateLimitMs,
        });
      }
      out.push(...chunk);
      // Report before the next batch can fail — this is the salvage point.
      if (onBatch) {
        try { onBatch(batchTexts, chunk, i); } catch { /* persistence is best-effort */ }
      }
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
    // Persistent translation cache. Without it every retry re-translated the
    // whole chapter and re-hit the 429 limit, which is what made "regenerate"
    // look like it was starting from zero.
    getCached,
    putCached,
    // Optional observation hook — see translation-timing.js for why the buckets
    // are kept apart.
    onBatchTiming,
    onCacheTiming,
  } = options;

  const cacheKey = (text) => `${from}|${to}|${text}`;
  const readCache = async (text) => {
    if (!getCached) return null;
    try { return (await getCached(cacheKey(text))) ?? null; } catch { return null; }
  };
  const writeCache = (text, translated) => {
    if (!putCached) return;
    Promise.resolve()
      .then(() => putCached(cacheKey(text), translated))
      .catch(() => { /* best-effort: quota, private mode, no IndexedDB */ });
  };

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

  // Fill in whatever the persistent cache already knows before hitting the
  // network, so a retry only pays for the paragraphs that never landed.
  if (getCached) {
    const hits = await Promise.all(
      entries.map(e => (e.type === 'translate' ? readCache(e.text) : null))
    );
    let hitCount = 0;
    hits.forEach((hit, i) => {
      if (hit !== null && hit !== undefined) {
        entries[i].result = hit;
        entries[i].fromCache = true;
        hitCount++;
        progress++;
        if (onProgress) onProgress(progress, total);
      }
    });
    if (onCacheTiming) {
      const looked = entries.filter(e => e.type === 'translate').length;
      onCacheTiming({ hits: hitCount, misses: looked - hitCount });
    }
  }

  // Process in batches — only translatable entries go to the API
  let batchTexts = [];
  let batchEntryIndices = [];

  let firstFlush = true;

  async function flushCurrentBatch(lastParaIndex) {
    if (batchTexts.length === 0) return;
    // Timed apart for the same reason as in translateTexts — see there.
    const pacingStart = _now();
    if (!firstFlush) await abortableSleep(BATCH_INTERVAL_MS);
    const pacingMs = _now() - pacingStart;
    firstFlush = false;
    let rateLimitMs = 0;
    const netStart = _now();
    const batchSize = batchTexts.length;
    const results = await translateBatch(batchTexts, from, to, fetchFn, {
      onWait: (seconds, attempt, reason) => {
        rateLimitMs += seconds * 1000;
        if (onStatus) {
          onStatus(reason === 'retry'
            ? `⚠️ 翻译服务暂时无响应，${seconds} 秒后重试（第 ${attempt} 次）— 进度不会丢失`
            : `⏳ 翻译服务限流 (429)，${seconds} 秒后自动重试（第 ${attempt} 次）— 进度不会丢失`);
        }
      },
      onFallback: () => {
        if (onStatus) onStatus('⚡ 微软翻译不可用 — 已自动切换 Google 翻译继续');
      },
    });
    if (onBatchTiming) {
      onBatchTiming({
        size: batchSize,
        networkMs: Math.max(0, (_now() - netStart) - rateLimitMs),
        pacingMs,
        rateLimitMs,
      });
    }
    for (let r = 0; r < results.length; r++) {
      const entry = entries[batchEntryIndices[r]];
      entry.result = results[r];
      // Written per batch, so a later batch failing never discards this one.
      writeCache(entry.text, results[r]);
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
    if (entry.fromCache) continue; // already satisfied from the persistent cache

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
  // Clearing the token means "try Microsoft properly again", so the
  // session-level unavailable verdict goes with it.
  _msUnavailable = false;
}
