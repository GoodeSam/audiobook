/**
 * Google free translation (gtx) — fallback provider when Microsoft
 * rate-limits (HTTP 429).
 *
 * Uses the same public endpoint Google Translate's own clients use:
 *   POST https://translate.googleapis.com/translate_a/t?client=gtx&sl=<from>&tl=<to>
 * with one form field `q` per text. Response is a JSON array with one entry
 * per text: a plain string when `sl` is fixed, or [translation, detectedLang]
 * when sl=auto. No API key; CORS-friendly; batch-capable.
 *
 * Note: reaching Google requires an unblocked network — translation runs on
 * the admin's machine, so users in mainland China are unaffected.
 */

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/t?client=gtx';

/** Map Microsoft-style language codes to Google's. */
export function toGoogleLang(code) {
  if (!code || code === 'auto') return 'auto';
  const map = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' };
  return map[code] || code;
}

/** Normalize one response entry to its translation string. */
export function parseGoogleEntry(entry) {
  if (Array.isArray(entry)) return String(entry[0] ?? '');
  return String(entry ?? '');
}

/**
 * Translate texts in one request. Same contract as ms-translator's
 * translateBatch: returns translations in input order, throws on failure.
 */
export async function googleTranslateBatch(texts, from, to, fetchFn = fetch) {
  if (texts.length === 0) return [];
  const sl = toGoogleLang(from);
  const tl = toGoogleLang(to);
  const body = new URLSearchParams();
  for (const t of texts) body.append('q', t);

  const resp = await fetchFn(`${GOOGLE_TRANSLATE_URL}&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}`, {
    method: 'POST',
    body,
  });
  if (!resp.ok) throw new Error(`Google Translate error: ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error('Google Translate: unexpected response');
  if (data.length !== texts.length) {
    // A single text can come back as a flat [translation, detectedLang] pair
    if (texts.length === 1) return [parseGoogleEntry(data)];
    throw new Error(`Google Translate: got ${data.length} results for ${texts.length} texts`);
  }
  return data.map(parseGoogleEntry);
}
