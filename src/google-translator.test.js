import { describe, it, expect } from 'vitest';
import { toGoogleLang, parseGoogleEntry, googleTranslateBatch } from './google-translator.js';

const okJson = (data) => ({ ok: true, json: async () => data });

describe('toGoogleLang', () => {
  it('maps Microsoft codes to Google codes', () => {
    expect(toGoogleLang('zh-Hans')).toBe('zh-CN');
    expect(toGoogleLang('zh-Hant')).toBe('zh-TW');
    expect(toGoogleLang('auto')).toBe('auto');
    expect(toGoogleLang('')).toBe('auto');
    expect(toGoogleLang('en')).toBe('en');
  });
});

describe('parseGoogleEntry', () => {
  it('handles plain strings and [translation, lang] pairs', () => {
    expect(parseGoogleEntry('你好')).toBe('你好');
    expect(parseGoogleEntry(['你好', 'en'])).toBe('你好');
  });
});

describe('googleTranslateBatch', () => {
  it('sends one q field per text and parses fixed-source responses', async () => {
    let captured;
    const fetchFn = async (url, opts) => {
      captured = { url, body: opts.body };
      return okJson(['你好世界。', '你今天怎么样？']);
    };
    const out = await googleTranslateBatch(['Hello world.', 'How are you?'], 'en', 'zh-Hans', fetchFn);
    expect(out).toEqual(['你好世界。', '你今天怎么样？']);
    expect(captured.url).toContain('sl=en');
    expect(captured.url).toContain('tl=zh-CN');
    expect(captured.body.getAll('q')).toEqual(['Hello world.', 'How are you?']);
  });

  it('parses sl=auto responses ([translation, detectedLang] pairs)', async () => {
    const fetchFn = async () => okJson([['早上好。', 'en'], ['稍后见。', 'en']]);
    const out = await googleTranslateBatch(['Good morning.', 'See you.'], 'auto', 'zh-Hans', fetchFn);
    expect(out).toEqual(['早上好。', '稍后见。']);
  });

  it('handles a single text returned as a flat pair', async () => {
    const fetchFn = async () => okJson(['你好', 'en']);
    const out = await googleTranslateBatch(['Hi'], 'auto', 'zh-Hans', fetchFn);
    expect(out).toEqual(['你好']);
  });

  it('throws on HTTP errors and count mismatches', async () => {
    await expect(googleTranslateBatch(['a'], 'en', 'zh-Hans', async () => ({ ok: false, status: 403 })))
      .rejects.toThrow('403');
    await expect(googleTranslateBatch(['a', 'b'], 'en', 'zh-Hans', async () => okJson(['only one'])))
      .rejects.toThrow('2 texts');
  });

  it('returns empty array for empty input without fetching', async () => {
    const out = await googleTranslateBatch([], 'en', 'zh-Hans', () => { throw new Error('no'); });
    expect(out).toEqual([]);
  });
});
