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

import { splitParagraphs, isSkipParagraph } from './paragraph-utils.js';

const MS_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const MS_TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate';
const BATCH_SIZE = 25; // Microsoft API limit per request

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
 * @returns {Promise<string[]>} Translated texts in same order.
 */
export async function translateBatch(texts, from, to, fetchFn = fetch) {
  if (texts.length === 0) return [];

  const token = await msGetAuthToken(fetchFn);
  const params = new URLSearchParams({ 'api-version': '3.0', to });
  if (from && from !== 'auto') {
    params.set('from', from);
  }

  const signal = _abortController?.signal;
  const resp = await fetchFn(`${MS_TRANSLATE_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(texts.map(t => ({ Text: t }))),
    ...(signal ? { signal } : {}),
  });

  if (!resp.ok) throw new Error(`Microsoft Translate error: ${resp.status}`);

  const data = await resp.json();
  return data.map((item, i) => {
    if (item?.translations?.[0]?.text) return item.translations[0].text;
    throw new Error(`Unexpected response for text ${i}`);
  });
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

  const {
    fetchFn = fetch,
    onProgress,
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

  // Build ordered list of paragraph entries: translatable ones get batched,
  // skipped ones (headings, images, rules) are inserted at their positions.
  // We accumulate translatable text across skip boundaries up to BATCH_SIZE.
  const entries = []; // { type: 'skip'|'translate', paraIndex, text }
  for (let i = startIndex; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    if (shouldSkipParagraph(para)) {
      entries.push({ type: 'skip', paraIndex: i, text: para });
    } else {
      entries.push({ type: 'translate', paraIndex: i, text: para.trim() });
    }
  }

  // Process in batches — only translatable entries go to the API
  let batchTexts = [];
  let batchEntryIndices = [];

  async function flushCurrentBatch(lastParaIndex) {
    if (batchTexts.length === 0) return;
    const results = await translateBatch(batchTexts, from, to, fetchFn);
    for (let r = 0; r < results.length; r++) {
      entries[batchEntryIndices[r]].result = results[r];
      progress++;
      if (onProgress) onProgress(progress, total);
    }
    batchTexts = [];
    batchEntryIndices = [];
    if (onCheckpoint) onCheckpoint({ completedIndex: lastParaIndex + 1, translatedParagraphs: translated, totalParagraphs: paragraphs.length });
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

  // Reconstruct output in paragraph order
  for (const entry of entries) {
    translated.push(entry.type === 'skip' ? entry.text : entry.result);
  }

  _abortController = null;
  return translated.join('\n\n');
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
