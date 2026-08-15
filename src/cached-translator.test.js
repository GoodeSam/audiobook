/**
 * Tests for the caching sentence translator.
 *
 * The bug this module fixes: main.js built its sentence-mode translator inline
 * and wrote translations to the IndexedDB cache only AFTER the whole call
 * resolved. `en-zh-en-sentence` (the default audio mode) translates an entire
 * chapter before synthesizing a single segment, so one rate-limit failure at
 * sentence 1000 discarded all 1000 and the retry started from sentence 1.
 *
 * The cache IS the checkpoint for sentence mode — so it must be written per
 * batch, and it must survive a mid-run failure.
 */
import { describe, it, expect, vi } from 'vitest';
import { createCachingTranslator, translationCacheKey } from './cached-translator.js';

/** In-memory stand-in for the IndexedDB `translations` store. */
function fakeCache(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    getCached: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    putCached: vi.fn(async (key, text) => { store.set(key, text); }),
  };
}

/**
 * Stand-in for ms-translator's translateTexts: translates in batches of
 * `batchSize`, invoking opts.onBatch after each, and throwing once it reaches
 * `failAtBatch` (0-indexed) to simulate a 429 partway through.
 */
function fakeTranslateTexts({ batchSize = 25, failAtBatch = null, render = (t) => `zh(${t})` } = {}) {
  const fn = vi.fn(async (texts, from, to, opts = {}) => {
    const out = [];
    for (let i = 0, b = 0; i < texts.length; i += batchSize, b++) {
      if (failAtBatch !== null && b === failAtBatch) {
        throw new Error('Microsoft Translate error: 429');
      }
      const batchTexts = texts.slice(i, i + batchSize);
      const translations = batchTexts.map(render);
      out.push(...translations);
      if (opts.onBatch) opts.onBatch(batchTexts, translations, i);
    }
    return out;
  });
  return fn;
}

describe('translationCacheKey', () => {
  it('includes source and target language so switching target misses the cache', () => {
    expect(translationCacheKey('en', 'zh-Hans', 'Hello'))
      .not.toBe(translationCacheKey('en', 'zh-Hant', 'Hello'));
  });

  it('is stable for the same triple', () => {
    expect(translationCacheKey('en', 'zh-Hans', 'Hello'))
      .toBe(translationCacheKey('en', 'zh-Hans', 'Hello'));
  });
});

describe('createCachingTranslator', () => {
  it('returns translations in the original order', async () => {
    const cache = fakeCache();
    const translateTexts = fakeTranslateTexts();
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    expect(await translate(['a', 'b', 'c'])).toEqual(['zh(a)', 'zh(b)', 'zh(c)']);
  });

  it('never calls the API when every sentence is already cached', async () => {
    const cache = fakeCache({
      [translationCacheKey('en', 'zh-Hans', 'a')]: '缓存A',
      [translationCacheKey('en', 'zh-Hans', 'b')]: '缓存B',
    });
    const translateTexts = fakeTranslateTexts();
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    expect(await translate(['a', 'b'])).toEqual(['缓存A', '缓存B']);
    expect(translateTexts).not.toHaveBeenCalled();
  });

  it('sends only the cache misses to the API, and merges hits back in order', async () => {
    const cache = fakeCache({
      [translationCacheKey('en', 'zh-Hans', 'b')]: '缓存B',
    });
    const translateTexts = fakeTranslateTexts();
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    const result = await translate(['a', 'b', 'c']);

    expect(result).toEqual(['zh(a)', '缓存B', 'zh(c)']);
    expect(translateTexts.mock.calls[0][0]).toEqual(['a', 'c']); // misses only
  });

  it('writes each batch to the cache as it completes, not at the end', async () => {
    const cache = fakeCache();
    const translateTexts = fakeTranslateTexts({ batchSize: 2 });
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    const writesAtBatchTime = [];
    cache.putCached.mockImplementation(async (key, text) => {
      cache.store.set(key, text);
      writesAtBatchTime.push(key);
    });

    await translate(['a', 'b', 'c', 'd']);

    // 4 sentences / batch of 2 = 2 batches; all 4 written.
    expect(writesAtBatchTime.length).toBe(4);
  });

  // ── The regression that caused "translation restarts from scratch" ──

  it('keeps completed batches cached when a later batch fails', async () => {
    const cache = fakeCache();
    const texts = Array.from({ length: 100 }, (_, i) => `s${i}`);
    // batches of 25; blow up on batch index 2 (i.e. after 50 succeed)
    const translateTexts = fakeTranslateTexts({ batchSize: 25, failAtBatch: 2 });
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    await expect(translate(texts)).rejects.toThrow(/429/);

    expect(cache.store.size).toBe(50);
    expect(cache.store.get(translationCacheKey('en', 'zh-Hans', 's0'))).toBe('zh(s0)');
    expect(cache.store.get(translationCacheKey('en', 'zh-Hans', 's49'))).toBe('zh(s49)');
    expect(cache.store.has(translationCacheKey('en', 'zh-Hans', 's50'))).toBe(false);
  });

  it('resumes from the cache on the next attempt instead of restarting', async () => {
    const cache = fakeCache();
    const texts = Array.from({ length: 100 }, (_, i) => `s${i}`);

    const failing = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts: fakeTranslateTexts({ batchSize: 25, failAtBatch: 2 }), ...cache,
    });
    await expect(failing(texts)).rejects.toThrow();

    const succeeding = fakeTranslateTexts({ batchSize: 25 });
    const retry = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts: succeeding, ...cache,
    });
    const result = await retry(texts);

    // Only the 50 that never translated are re-sent — this is the whole point.
    expect(succeeding.mock.calls[0][0].length).toBe(50);
    expect(succeeding.mock.calls[0][0][0]).toBe('s50');
    expect(result[0]).toBe('zh(s0)');
    expect(result[99]).toBe('zh(s99)');
  });

  it('maps batch offsets back to the original texts, not the miss list', async () => {
    // Regression guard: misses are a filtered subarray, so onBatch's offset is
    // an index into the MISS list. Writing it against the original list would
    // cache translations under the wrong sentences.
    const cache = fakeCache({
      [translationCacheKey('en', 'zh-Hans', 'a')]: '缓存A',
      [translationCacheKey('en', 'zh-Hans', 'b')]: '缓存B',
    });
    const translateTexts = fakeTranslateTexts({ batchSize: 1 });
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    await translate(['a', 'b', 'c', 'd']);

    expect(cache.store.get(translationCacheKey('en', 'zh-Hans', 'c'))).toBe('zh(c)');
    expect(cache.store.get(translationCacheKey('en', 'zh-Hans', 'd'))).toBe('zh(d)');
    // The pre-seeded entries must not have been overwritten with the wrong text.
    expect(cache.store.get(translationCacheKey('en', 'zh-Hans', 'a'))).toBe('缓存A');
    expect(cache.store.get(translationCacheKey('en', 'zh-Hans', 'b'))).toBe('缓存B');
  });

  it('survives a cache backend that throws on read', async () => {
    const cache = fakeCache();
    cache.getCached.mockRejectedValue(new Error('IndexedDB unavailable'));
    const translateTexts = fakeTranslateTexts();
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    expect(await translate(['a'])).toEqual(['zh(a)']);
  });

  it('survives a cache backend that throws on write', async () => {
    const cache = fakeCache();
    cache.putCached.mockRejectedValue(new Error('QuotaExceededError'));
    const translateTexts = fakeTranslateTexts();
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    expect(await translate(['a', 'b'])).toEqual(['zh(a)', 'zh(b)']);
  });

  it('reports cache hits and remaining work through onStatus', async () => {
    const cache = fakeCache({
      [translationCacheKey('en', 'zh-Hans', 'a')]: '缓存A',
    });
    const onStatus = vi.fn();
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts: fakeTranslateTexts(), onStatus, ...cache,
    });

    await translate(['a', 'b']);

    expect(onStatus).toHaveBeenCalled();
    expect(onStatus.mock.calls.map(c => c[0]).join(' ')).toMatch(/1/);
  });

  it('handles an empty input without calling the API', async () => {
    const cache = fakeCache();
    const translateTexts = fakeTranslateTexts();
    const translate = createCachingTranslator({
      from: 'en', to: 'zh-Hans', translateTexts, ...cache,
    });

    expect(await translate([])).toEqual([]);
    expect(translateTexts).not.toHaveBeenCalled();
  });
});
