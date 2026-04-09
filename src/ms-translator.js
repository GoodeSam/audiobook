/**
 * Microsoft Free Translation Service.
 *
 * Uses the same free Edge Translate API as EasyOriginals' reader.js.
 * No API key required - gets a JWT from edge.microsoft.com/translate/auth
 * and uses it with api.cognitive.microsofttranslator.com.
 *
 * Token is cached for 8 minutes (valid for ~10 minutes).
 */

const MS_AUTH_URL = 'https://edge.microsoft.com/translate/auth';
const MS_TRANSLATE_URL = 'https://api.cognitive.microsofttranslator.com/translate';

let _cachedToken = null;
let _tokenExpiry = 0;
let _cancelled = false;

/**
 * Get a Microsoft Translate auth token, using cache when valid.
 * @param {Function} fetchFn - Fetch implementation (for testing).
 * @returns {Promise<string>} JWT token.
 */
export async function msGetAuthToken(fetchFn = fetch) {
  if (_cachedToken && Date.now() < _tokenExpiry) {
    return _cachedToken;
  }

  const resp = await fetchFn(MS_AUTH_URL);
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
  const token = await msGetAuthToken(fetchFn);
  const params = new URLSearchParams({ 'api-version': '3.0', to });
  // Only set 'from' if explicitly provided and not 'auto'; omitting lets Microsoft auto-detect
  if (from && from !== 'auto') {
    params.set('from', from);
  }

  const resp = await fetchFn(`${MS_TRANSLATE_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ Text: text }]),
  });

  if (!resp.ok) throw new Error(`Microsoft Translate error: ${resp.status}`);

  const data = await resp.json();
  if (data?.[0]?.translations?.[0]?.text) {
    return data[0].translations[0].text;
  }
  throw new Error('Unexpected Microsoft Translate response');
}

/**
 * Check if a markdown paragraph should be skipped (not translated).
 */
function shouldSkipParagraph(para) {
  const trimmed = para.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;       // Headings
  if (/^!\[.*\]\(.*\)$/.test(trimmed)) return true;   // Images
  if (/^---+$/.test(trimmed)) return true;             // Horizontal rules
  return false;
}

/**
 * Translate a full markdown chapter paragraph by paragraph.
 * Headings, images, and rules are preserved untranslated.
 *
 * @param {string} markdown - Chapter markdown text.
 * @param {string} from - Source language code.
 * @param {string} to - Target language code.
 * @param {object} options - { fetchFn, onProgress(current, total) }
 * @returns {Promise<string>} Translated markdown.
 */
export async function translateChapter(markdown, from, to, options = {}) {
  _cancelled = false;
  const { fetchFn = fetch, onProgress } = options;

  const paragraphs = markdown.split(/\n\n+/).filter(p => p.trim());
  const total = paragraphs.filter(p => !shouldSkipParagraph(p)).length;
  const translated = [];
  let progress = 0;

  for (const para of paragraphs) {
    if (_cancelled) throw new Error('Translation cancelled');

    if (shouldSkipParagraph(para)) {
      translated.push(para);
      continue;
    }

    const result = await translateText(para.trim(), from, to, fetchFn);
    translated.push(result);
    progress++;
    if (onProgress) onProgress(progress, total);

    if (_cancelled) throw new Error('Translation cancelled');
  }

  return translated.join('\n\n');
}

/**
 * Cancel an in-progress translation.
 */
export function cancelTranslation() {
  _cancelled = true;
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
