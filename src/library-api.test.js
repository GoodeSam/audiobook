import { describe, it, expect } from 'vitest';
import { apiOrigin, normalizeAccessInput, accessToInput, makePublishId } from './library-api.js';

describe('apiOrigin', () => {
  it('uses same origin on the production site', () => {
    expect(apiOrigin({ hostname: 'audiobook.tumei.online' })).toBe('');
  });

  it('points local dev at the production API', () => {
    expect(apiOrigin({ hostname: 'localhost' })).toBe('https://audiobook.tumei.online');
  });

  it('points GitHub Pages at the production API', () => {
    expect(apiOrigin({ hostname: 'goodesam.github.io' })).toBe('https://audiobook.tumei.online');
  });
});

describe('normalizeAccessInput', () => {
  it('empty input means public', () => {
    expect(normalizeAccessInput('')).toBe('public');
    expect(normalizeAccessInput('   ')).toBe('public');
    expect(normalizeAccessInput(null)).toBe('public');
  });

  it('accepts the words public / 公开', () => {
    expect(normalizeAccessInput('public')).toBe('public');
    expect(normalizeAccessInput('PUBLIC')).toBe('public');
    expect(normalizeAccessInput('公开')).toBe('public');
  });

  it('normalizes comma lists: trim, lowercase, drop empties', () => {
    expect(normalizeAccessInput('alice, Bob,')).toBe('alice,bob');
    expect(normalizeAccessInput('  x ')).toBe('x');
  });

  it('splits on Chinese commas, 、 and whitespace too', () => {
    expect(normalizeAccessInput('alice，bob、carol dave')).toBe('alice,bob,carol,dave');
  });
});

describe('makePublishId', () => {
  it('strips characters the server rejects (parens, dots, spaces)', () => {
    expect(makePublishId('Self-Talk 6-16 (Organized) copy 2')).toBe('self-talk-6-16-organized-copy-2');
  });

  it('drops non-latin characters but keeps the latin part', () => {
    expect(makePublishId('演示 · The Quiet Village')).toBe('the-quiet-village');
  });

  it('gives pure-Chinese titles a stable hashed id', () => {
    const id = makePublishId('自言自语');
    expect(id).toMatch(/^book-[a-z0-9]+$/);
    expect(makePublishId('自言自语')).toBe(id); // deterministic
    expect(makePublishId('另一本书')).not.toBe(id);
  });

  it('caps length at 60 and never ends with a dash', () => {
    const id = makePublishId('a'.repeat(59) + ' tail words here');
    expect(id.length).toBeLessThanOrEqual(60);
    expect(id.endsWith('-')).toBe(false);
  });
});

describe('accessToInput', () => {
  it('public and missing access render as "public"', () => {
    expect(accessToInput('public')).toBe('public');
    expect(accessToInput(null)).toBe('public');
    expect(accessToInput(undefined)).toBe('public');
  });

  it('joins code arrays for editing', () => {
    expect(accessToInput(['alice', 'bob'])).toBe('alice, bob');
  });
});
