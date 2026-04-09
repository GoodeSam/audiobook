import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  msGetAuthToken,
  translateText,
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
    let callCount = 0;
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '第一段。' }] }]),
      okJsonResponse([{ translations: [{ text: '第二段。' }] }]),
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
      okJsonResponse([{ translations: [{ text: '文本。' }] }]),
      okJsonResponse([{ translations: [{ text: '更多。' }] }]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });
    expect(result).toContain('文本。');
    expect(result).toContain('更多。');
  });

  it('respects cancellation', async () => {
    const markdown = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.';
    let translateCallCount = 0;
    const fetchFn = async (url, opts) => {
      if (url.includes('translate/auth')) {
        return okTextResponse('token');
      }
      translateCallCount++;
      if (translateCallCount === 1) {
        // Cancel after first translation
        cancelTranslation();
        return okJsonResponse([{ translations: [{ text: '段落一。' }] }]);
      }
      return okJsonResponse([{ translations: [{ text: '段落。' }] }]);
    };

    await expect(
      translateChapter(markdown, 'en', 'zh-Hans', { fetchFn })
    ).rejects.toThrow('cancelled');
  });

  it('skips horizontal rules', async () => {
    const markdown = 'Text above.\n\n---\n\nText below.';
    const fetchFn = mockFetch([
      okTextResponse('token'),
      okJsonResponse([{ translations: [{ text: '上面。' }] }]),
      okJsonResponse([{ translations: [{ text: '下面。' }] }]),
    ]);

    const result = await translateChapter(markdown, 'en', 'zh-Hans', { fetchFn });
    expect(result).toContain('---');
    expect(result).toContain('上面。');
    expect(result).toContain('下面。');
  });
});
