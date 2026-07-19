import { describe, it, expect } from 'vitest';
import { apiOrigin, normalizeAccessInput, accessToInput } from './library-api.js';

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
