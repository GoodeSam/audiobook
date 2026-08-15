/**
 * Sentence translator backed by a persistent translation cache.
 *
 * Extracted from main.js so the resume behaviour is testable.
 *
 * Why this exists: `en-zh-en-sentence` — the default audio mode — translates an
 * entire chapter inside generateChapterAudio BEFORE the first audio segment is
 * synthesized, and that phase emits no audio checkpoint (the segment loop has
 * not started yet). So the translation cache is the ONLY resume point for it.
 *
 * The original inline version wrote to the cache only after the whole call
 * resolved, which meant a rate-limit failure at sentence 1000 discarded all
 * 1000 and the retry restarted from sentence 1. Here every batch is written
 * the moment it returns, so a failure costs at most one batch.
 */

/**
 * Cache key for one translated sentence.
 * Includes both languages so switching target language cannot return a
 * translation produced for a different one.
 *
 * @param {string} from - Source language code (or 'auto').
 * @param {string} to - Target language code.
 * @param {string} text - Source sentence.
 * @returns {string}
 */
export function translationCacheKey(from, to, text) {
  return `${from}|${to}|${text}`;
}

/**
 * Build a translate function that reads through a cache and writes each batch
 * back as soon as it completes.
 *
 * @param {object} options
 * @param {string} options.from - Source language code.
 * @param {string} options.to - Target language code.
 * @param {Function} options.translateTexts - (texts, from, to, opts) => Promise<string[]>,
 *   expected to invoke opts.onBatch(batchTexts, translations, offset) per batch.
 * @param {Function} options.getCached - (key) => Promise<string|null>
 * @param {Function} options.putCached - (key, text) => Promise<void>
 * @param {Function} [options.onStatus] - Progress/status message sink.
 * @param {object} [options.translateOptions] - Extra options forwarded to translateTexts.
 * @returns {(texts: string[]) => Promise<string[]>}
 */
export function createCachingTranslator({
  from,
  to,
  translateTexts,
  getCached,
  putCached,
  onStatus,
  onCacheTiming,
  translateOptions = {},
}) {
  const keyFor = (text) => translationCacheKey(from, to, text);

  return async function translate(texts) {
    if (!texts || texts.length === 0) return [];

    // A cache backend that is unavailable must degrade to "everything is a
    // miss", never to a thrown error — translation still works without it.
    const cached = await Promise.all(
      texts.map(t => Promise.resolve()
        .then(() => getCached(keyFor(t)))
        .catch(() => null))
    );

    const missIdx = [];
    cached.forEach((c, i) => { if (c === null || c === undefined) missIdx.push(i); });
    if (onCacheTiming) {
      onCacheTiming({ hits: texts.length - missIdx.length, misses: missIdx.length });
    }

    if (missIdx.length === 0) {
      if (onStatus) onStatus(`翻译缓存命中 ${texts.length} 句，无需请求翻译服务`);
      return cached;
    }

    const hits = texts.length - missIdx.length;
    if (onStatus && hits > 0) {
      onStatus(`翻译缓存命中 ${hits} 句，还需翻译 ${missIdx.length} 句…`);
    }

    const missTexts = missIdx.map(i => texts[i]);
    const fresh = new Array(missTexts.length);

    // `offset` indexes into missTexts, NOT into texts — mapping it back through
    // missIdx is what keeps each translation attached to its own sentence.
    const onBatch = (batchTexts, translations, offset) => {
      for (let j = 0; j < batchTexts.length; j++) {
        const translated = translations[j];
        if (translated === undefined) continue;
        fresh[offset + j] = translated;
        Promise.resolve()
          .then(() => putCached(keyFor(batchTexts[j]), translated))
          .catch(() => { /* cache write is best-effort (quota, private mode) */ });
      }
    };

    const result = await translateTexts(missTexts, from, to, {
      ...translateOptions,
      onBatch,
    });

    // translateTexts is the authority on the final ordering; onBatch only
    // exists so partial work survives a failure.
    result.forEach((t, i) => { if (t !== undefined) fresh[i] = t; });

    let j = 0;
    return texts.map((_, i) => (cached[i] !== null && cached[i] !== undefined ? cached[i] : fresh[j++]));
  };
}
