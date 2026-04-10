import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  msGetAuthToken,
  translateText,
  translateBatch,
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

    await expect(translateText('test', 'en', 'zh-Hans', fetchFn)).rejects.toThrow('429');
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

  it('skips markdown headings (preserves them untranslated)', async () => {
    const markdown = '# Chapter Title\n\nSome text here.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '一些文字。' }] }]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });

    expect(result).toContain('# Chapter Title');
    expect(result).toContain('一些文字。');
    // Only one translate call (heading skipped)
    expect(fetchFn.calls.length).toBe(2); // 1 auth + 1 translate
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

  it('accumulates across skip paragraphs into one batch', async () => {
    const markdown = 'Text.\n\n# Heading\n\nMore text.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      // Both translatable paragraphs batched together despite heading between them
      okJsonResponse([
        { translations: [{ text: '文本。' }] },
        { translations: [{ text: '更多。' }] },
      ]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });

    expect(result).toContain('文本。');
    expect(result).toContain('# Heading');
    expect(result).toContain('更多。');
    // Only 1 auth + 1 translate call (not split by heading)
    expect(fetchFn.calls.length).toBe(2);
  });
});
