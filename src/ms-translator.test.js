import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  msGetAuthToken,
  translateText,
  translateBatch,
  translateTexts,
  translateChapter,
  cancelTranslation,
  resetTranslationState,
  _clearTokenCache,
} from './ms-translator.js';

// Helper to create a mock fetch
function mockFetch(responses) {
  const calls = [];
  let callIndex = 0;
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const response = responses[callIndex] || responses[responses.length - 1];
    callIndex++;
    return response;
  };
  fn.calls = calls;
  return fn;
}

function okTextResponse(text) {
  return { ok: true, text: async () => text, json: async () => JSON.parse(text) };
}

function okJsonResponse(data) {
  return { ok: true, json: async () => data, text: async () => JSON.stringify(data) };
}

function errorResponse(status) {
  return { ok: false, status };
}

describe('msGetAuthToken', () => {
  beforeEach(() => {
    _clearTokenCache();
  });

  it('fetches a new token from the auth endpoint', async () => {
    const fetchFn = mockFetch([okTextResponse('test-jwt-token')]);
    const token = await msGetAuthToken(fetchFn);

    expect(token).toBe('test-jwt-token');
    expect(fetchFn.calls.length).toBe(1);
    expect(fetchFn.calls[0].url).toContain('edge.microsoft.com/translate/auth');
  });

  it('caches the token on subsequent calls', async () => {
    const fetchFn = mockFetch([okTextResponse('cached-token')]);

    const token1 = await msGetAuthToken(fetchFn);
    const token2 = await msGetAuthToken(fetchFn);

    expect(token1).toBe('cached-token');
    expect(token2).toBe('cached-token');
    expect(fetchFn.calls.length).toBe(1); // Only one fetch call
  });

  it('throws on auth failure', async () => {
    const fetchFn = mockFetch([errorResponse(403)]);
    await expect(msGetAuthToken(fetchFn)).rejects.toThrow('auth');
  });
});

describe('translateText', () => {
  beforeEach(() => {
    _clearTokenCache();
  });

  it('sends correct request and returns translated text', async () => {
    const fetchFn = mockFetch([
      okTextResponse('jwt-token'), // auth
      okJsonResponse([{ translations: [{ text: '你好世界' }] }]), // translate
    ]);

    const result = await translateText('Hello world', 'en', 'zh-Hans', fetchFn);

    expect(result).toBe('你好世界');
    // Second call should be the translate API
    expect(fetchFn.calls[1].url).toContain('api.cognitive.microsofttranslator.com/translate');
    expect(fetchFn.calls[1].opts.method).toBe('POST');

    const body = JSON.parse(fetchFn.calls[1].opts.body);
    expect(body).toEqual([{ Text: 'Hello world' }]);
  });

  it('includes Bearer token in auth header', async () => {
    const fetchFn = mockFetch([
      okTextResponse('my-token'),
      okJsonResponse([{ translations: [{ text: 'translated' }] }]),
    ]);

    await translateText('test', 'en', 'zh-Hans', fetchFn);

    expect(fetchFn.calls[1].opts.headers['Authorization']).toBe('Bearer my-token');
  });

  it('includes correct api-version and language params', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: 'translated' }] }]),
    ]);

    await translateText('test', 'en', 'zh-Hans', fetchFn);

    const url = fetchFn.calls[1].url;
    expect(url).toContain('api-version=3.0');
    expect(url).toContain('from=en');
    expect(url).toContain('to=zh-Hans');
  });

  it('omits from param when set to auto for auto-detection', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: 'translated' }] }]),
    ]);

    await translateText('test', 'auto', 'zh-Hans', fetchFn);

    const url = fetchFn.calls[1].url;
    expect(url).toContain('api-version=3.0');
    expect(url).toContain('to=zh-Hans');
    expect(url).not.toContain('from=');
  });

  it('throws on translate API failure', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      errorResponse(429),
    ]);

    await expect(
      translateBatch(['test'], 'en', 'zh-Hans', fetchFn, { maxRetries: 0, noGoogleFallback: true })
    ).rejects.toThrow('429');
  });

  it('falls back to Google when Microsoft returns 429', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      errorResponse(429),
    ]);
    const googleFetchFn = async () => ({ ok: true, json: async () => ['你好'] });

    const fallbacks = [];
    const out = await translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
      googleFetchFn,
      onFallback: (provider) => fallbacks.push(provider),
    });
    expect(out).toEqual(['你好']);
    expect(fallbacks).toEqual(['google']);
  });

  it('retries 429 with backoff and eventually succeeds', async () => {
    _clearTokenCache();
    const fetchFn = mockFetch([
      okTextResponse('token'),
      errorResponse(429),
      errorResponse(429),
      okJsonResponse([{ translations: [{ text: '你好' }] }]),
    ]);

    const waits = [];
    const results = await translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
      rateLimitDelays: [1, 1, 1],
      noGoogleFallback: true,
      onWait: (seconds, attempt) => waits.push(attempt),
    });

    expect(results).toEqual(['你好']);
    expect(fetchFn.calls.length).toBe(4); // auth + 2 failures + success
    expect(waits).toEqual([1, 2]);
  });

  it('honors the Retry-After header on 429', async () => {
    _clearTokenCache();
    const resp429 = {
      ok: false,
      status: 429,
      headers: { get: (h) => (h.toLowerCase() === 'retry-after' ? '0.001' : null) },
    };
    const fetchFn = mockFetch([
      okTextResponse('token'),
      resp429,
      okJsonResponse([{ translations: [{ text: 'ok' }] }]),
    ]);

    const start = Date.now();
    // Default table would wait 5s — the tiny Retry-After must win
    const results = await translateBatch(['x'], 'en', 'zh-Hans', fetchFn, { noGoogleFallback: true });
    expect(results).toEqual(['ok']);
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('throws on malformed response', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{}]), // missing translations
    ]);

    await expect(translateText('test', 'en', 'zh-Hans', fetchFn)).rejects.toThrow();
  });
});

describe('translateChapter', () => {
  beforeEach(() => {
    _clearTokenCache();
    resetTranslationState();
  });

  it('translates each paragraph and returns results', async () => {
    const markdown = 'First paragraph.\n\nSecond paragraph.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      // Both paragraphs batched in one call
      okJsonResponse([
        { translations: [{ text: '第一段。' }] },
        { translations: [{ text: '第二段。' }] },
      ]),
    ]);

    const progressCalls = [];
    const result = await translateChapter(markdown, 'en', 'zh-Hans', {
      fetchFn,
      onProgress: (current, total) => progressCalls.push({ current, total }),
    });

    expect(result).toBe('第一段。\n\n第二段。');
    expect(progressCalls).toEqual([
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ]);
  });

  it('translates heading text while preserving # markers', async () => {
    const markdown = '# Chapter Title\n\nSome text here.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      // Both heading text and body text batched together
      okJsonResponse([
        { translations: [{ text: '章节标题' }] },
        { translations: [{ text: '一些文字。' }] },
      ]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });

    expect(result).toContain('# 章节标题');
    expect(result).toContain('一些文字。');
    expect(fetchFn.calls.length).toBe(2); // 1 auth + 1 translate batch
  });

  it('skips image markdown', async () => {
    const markdown = '![alt](image.png)\n\nSome text.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '文字。' }] }]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });
    expect(result).toContain('![alt](image.png)');
  });

  it('handles empty paragraphs', async () => {
    const markdown = 'Text.\n\n\n\nMore text.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      // Both texts batched in one call
      okJsonResponse([
        { translations: [{ text: '文本。' }] },
        { translations: [{ text: '更多。' }] },
      ]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });
    expect(result).toContain('文本。');
    expect(result).toContain('更多。');
  });

  it('respects cancellation', async () => {
    // Use many paragraphs so there are multiple batches (batch size = 25)
    // Or cancel during the fetch itself
    const markdown = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
    const fetchFn = async (url, opts) => {
      if (url.includes('translate/auth')) {
        return okTextResponse('token');
      }
      // Cancel during the translate fetch — AbortController aborts the signal
      cancelTranslation();
      // Simulate abort error
      throw new DOMException('The operation was aborted', 'AbortError');
    };

    await expect(
      translateChapter(markdown, 'en', 'zh-Hans', { fetchFn })
    ).rejects.toThrow();
  });

  it('skips horizontal rules', async () => {
    const markdown = 'Text above.\n\n---\n\nText below.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      // Both texts batched in one call (rule is skipped, not a flush point)
      okJsonResponse([
        { translations: [{ text: '上面。' }] },
        { translations: [{ text: '下面。' }] },
      ]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });
    expect(result).toContain('---');
    expect(result).toContain('上面。');
    expect(result).toContain('下面。');
  });
});

describe('translateBatch', () => {
  beforeEach(() => {
    _clearTokenCache();
  });

  it('translates multiple texts in a single API call', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([
        { translations: [{ text: '你好' }] },
        { translations: [{ text: '世界' }] },
      ]),
    ]);

    const results = await translateBatch(['Hello', 'World'], 'en', 'zh-Hans', fetchFn);

    expect(results).toEqual(['你好', '世界']);
    // Only 2 calls: 1 auth + 1 translate (not 1 per text)
    expect(fetchFn.calls.length).toBe(2);

    const body = JSON.parse(fetchFn.calls[1].opts.body);
    expect(body).toEqual([{ Text: 'Hello' }, { Text: 'World' }]);
  });

  it('returns empty array for empty input', async () => {
    const fetchFn = mockFetch([]);
    const results = await translateBatch([], 'en', 'zh-Hans', fetchFn);
    expect(results).toEqual([]);
    expect(fetchFn.calls.length).toBe(0);
  });
});

describe('translateChapter batching', () => {
  beforeEach(() => {
    _clearTokenCache();
    resetTranslationState();
  });

  it('batches consecutive translatable paragraphs', async () => {
    const markdown = 'Para one.\n\nPara two.\n\nPara three.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([
        { translations: [{ text: '段一。' }] },
        { translations: [{ text: '段二。' }] },
        { translations: [{ text: '段三。' }] },
      ]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });

    expect(result).toContain('段一。');
    expect(result).toContain('段三。');
    // 1 auth + 1 batch translate (not 3 individual calls)
    expect(fetchFn.calls.length).toBe(2);
  });

  it('translates headings along with body text in one batch', async () => {
    const markdown = 'Text.\n\n# Heading\n\nMore text.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      // All 3 translatable items (text, heading text, text) in one batch
      okJsonResponse([
        { translations: [{ text: '文本。' }] },
        { translations: [{ text: '标题' }] },
        { translations: [{ text: '更多。' }] },
      ]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });

    expect(result).toContain('文本。');
    expect(result).toContain('# 标题'); // Heading translated with # preserved
    expect(result).toContain('更多。');
    expect(fetchFn.calls.length).toBe(2); // 1 auth + 1 batch
  });
});

// ── Batch-level salvage (resumability) ──
//
// Root cause of "translation restarts from scratch": translateTexts collected
// every batch into a local array and only returned at the end, so the caller
// could not persist anything until ALL batches succeeded. A 1500-sentence
// chapter is 60 batches — failing on batch 40 discarded 1000 good sentences.

describe('translateTexts batch salvage', () => {
  beforeEach(() => {
    _clearTokenCache();
    resetTranslationState();
  });

  /** Auth once, then one response per translate batch. */
  function batchingFetch(batchResponses) {
    let translateCalls = 0;
    const fn = async (url) => {
      if (String(url).includes('/translate/auth')) return okTextResponse('token');
      const resp = batchResponses[translateCalls++];
      if (!resp) throw new Error('unexpected extra batch call');
      return resp;
    };
    return fn;
  }

  const zh = (n) => okJsonResponse(
    Array.from({ length: n }, (_, i) => ({ translations: [{ text: `译${i}` }] }))
  );

  it('reports each successful batch through onBatch before finishing', async () => {
    const texts = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const fetchFn = batchingFetch([zh(25), zh(5)]);
    const seen = [];

    await translateTexts(texts, 'en', 'zh-Hans', {
      fetchFn,
      onBatch: (batchTexts, translations, offset) => {
        seen.push({ count: batchTexts.length, translations: translations.length, offset });
      },
    });

    expect(seen).toEqual([
      { count: 25, translations: 25, offset: 0 },
      { count: 5, translations: 5, offset: 25 },
    ]);
  });

  it('keeps earlier batches reported when a later batch fails', async () => {
    const texts = Array.from({ length: 60 }, (_, i) => `s${i}`);
    // batch 1 ok, batch 2 ok, batch 3 hard-fails (400 is non-retryable)
    const fetchFn = batchingFetch([zh(25), zh(25), errorResponse(400)]);
    const salvaged = [];

    await expect(
      translateTexts(texts, 'en', 'zh-Hans', {
        fetchFn,
        onBatch: (batchTexts, translations, offset) => {
          batchTexts.forEach((t, i) => salvaged.push([offset + i, translations[i]]));
        },
      })
    ).rejects.toThrow();

    // The 50 sentences that DID translate must survive the failure.
    expect(salvaged.length).toBe(50);
    expect(salvaged[0]).toEqual([0, '译0']);
    expect(salvaged[49]).toEqual([49, '译24']);
  });

  it('passes the original texts alongside their translations', async () => {
    const fetchFn = batchingFetch([zh(3)]);
    let received = null;

    await translateTexts(['a', 'b', 'c'], 'en', 'zh-Hans', {
      fetchFn,
      onBatch: (batchTexts) => { received = batchTexts; },
    });

    expect(received).toEqual(['a', 'b', 'c']);
  });
});

// ── Chapter translation through the persistent cache ──
//
// translateChapter never consulted the IndexedDB `translations` store — only
// the sentence-mode translator did. So re-running a chapter after any failure
// re-translated every paragraph and re-hit the 429 rate limit, which is why
// "regenerate" felt like starting from zero even when work had been done.

describe('translateChapter translation cache', () => {
  beforeEach(() => {
    _clearTokenCache();
    resetTranslationState();
  });

  function fakeCache(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
      store,
      getCached: async (key) => (store.has(key) ? store.get(key) : null),
      putCached: async (key, text) => { store.set(key, text); },
    };
  }

  const key = (t) => `en|zh-Hans|${t}`;

  it('skips the API entirely when every paragraph is cached', async () => {
    const cache = fakeCache({ [key('One.')]: '一。', [key('Two.')]: '二。' });
    const fetchFn = mockFetch([okTextResponse('token')]);

    const result = await translateChapter('One.\n\nTwo.', 'en', 'zh-Hans', {
      fetchFn, getCached: cache.getCached, putCached: cache.putCached,
    });

    expect(result).toBe('一。\n\n二。');
    expect(fetchFn.calls.length).toBe(0); // not even an auth call
  });

  it('sends only uncached paragraphs to the API', async () => {
    const cache = fakeCache({ [key('One.')]: '一。' });
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '二。' }] }]),
    ]);

    const result = await translateChapter('One.\n\nTwo.', 'en', 'zh-Hans', {
      fetchFn, getCached: cache.getCached, putCached: cache.putCached,
    });

    expect(result).toBe('一。\n\n二。');
    const body = JSON.parse(fetchFn.calls[1].opts.body);
    expect(body).toEqual([{ Text: 'Two.' }]);
  });

  it('writes freshly translated paragraphs into the cache', async () => {
    const cache = fakeCache();
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '一。' }] }]),
    ]);

    await translateChapter('One.', 'en', 'zh-Hans', {
      fetchFn, getCached: cache.getCached, putCached: cache.putCached,
    });

    expect(cache.store.get(key('One.'))).toBe('一。');
  });

  it('caches heading text without the # prefix so it is reusable', async () => {
    const cache = fakeCache();
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '标题' }] }]),
    ]);

    const result = await translateChapter('# Title', 'en', 'zh-Hans', {
      fetchFn, getCached: cache.getCached, putCached: cache.putCached,
    });

    expect(result).toBe('# 标题');
    expect(cache.store.get(key('Title'))).toBe('标题');
  });

  it('still works when no cache is supplied at all', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '一。' }] }]),
    ]);

    expect(await translateChapter('One.', 'en', 'zh-Hans', { fetchFn })).toBe('一。');
  });

  it('degrades to translating when the cache backend throws', async () => {
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '一。' }] }]),
    ]);

    const result = await translateChapter('One.', 'en', 'zh-Hans', {
      fetchFn,
      getCached: async () => { throw new Error('IndexedDB unavailable'); },
      putCached: async () => { throw new Error('QuotaExceededError'); },
    });

    expect(result).toBe('一。');
  });
});

/**
 * Microsoft's free token endpoint (edge.microsoft.com/translate/auth) began
 * returning 404 with an empty body — verified in a real browser, twice, while
 * Google's endpoint answered normally in 1.6s.
 *
 * Three separate defects turned that outage into "translation shows no progress
 * at all":
 *   1. a failing token fetch was classified as a transient network error, so it
 *      retried on [1,3,5,10,15]s — 34 seconds of complete silence, because that
 *      path never called onWait;
 *   2. the Google fallback was gated on `resp.status === 429`, and a thrown
 *      token fetch never assigns `resp`, so Google was never reached even
 *      though it was working;
 *   3. every batch repeated the whole doomed sequence from scratch.
 */
describe('surviving a Microsoft outage', () => {
  beforeEach(() => {
    _clearTokenCache();
    resetTranslationState();
  });

  const googleOk = (translations) => async () => ({
    ok: true,
    json: async () => translations,
    text: async () => JSON.stringify(translations),
  });

  it('falls back to Google when the auth token cannot be fetched', async () => {
    const fetchFn = mockFetch([errorResponse(404)]); // auth is down
    const googleFetchFn = mockFetch([]);
    googleFetchFn.calls = [];
    const google = googleOk(['你好']);

    const result = await translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
      maxRetries: 1,
      googleFetchFn: google,
    });

    expect(result).toEqual(['你好']);
  });

  it('reports the fallback so the UI can say what happened', async () => {
    const fetchFn = mockFetch([errorResponse(404)]);
    const onFallback = vi.fn();

    await translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
      maxRetries: 1,
      googleFetchFn: googleOk(['你好']),
      onFallback,
    });

    expect(onFallback).toHaveBeenCalledWith('google');
  });

  // Otherwise every batch pays the full doomed auth sequence again.
  it('stops re-attempting Microsoft auth once it is known to be down', async () => {
    const fetchFn = mockFetch([errorResponse(404)]);
    const google = googleOk(['你好']);

    await translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
      maxRetries: 1, googleFetchFn: google,
    });
    const afterFirst = fetchFn.calls.length;
    await translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
      maxRetries: 1, googleFetchFn: google,
    });

    expect(fetchFn.calls.length).toBe(afterFirst);
  });

  // Silence is the actual reported symptom; retries must be visible.
  it('announces a transient retry instead of waiting silently', async () => {
    const onWait = vi.fn();
    const fetchFn = mockFetch([errorResponse(500)]);

    await expect(
      translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
        maxRetries: 1,
        noGoogleFallback: true,
        rateLimitDelays: [0],
        transientDelays: [0],
        onWait,
      })
    ).rejects.toThrow();

    expect(onWait).toHaveBeenCalled();
  });

  it('still throws when both providers are unusable', async () => {
    const fetchFn = mockFetch([errorResponse(404)]);
    const googleFetchFn = async () => { throw new Error('google unreachable'); };

    await expect(
      translateBatch(['Hello'], 'en', 'zh-Hans', fetchFn, {
        maxRetries: 0, googleFetchFn, transientDelays: [0],
      })
    ).rejects.toThrow();
  });
});
