import { describe, it, expect } from 'vitest';
import { isChinese, detectLanguage, splitByLanguage } from './language-utils.js';

describe('isChinese', () => {
  it('returns true for CJK unified ideographs', () => {
    expect(isChinese('中')).toBe(true);
    expect(isChinese('国')).toBe(true);
    expect(isChinese('人')).toBe(true);
  });

  it('returns true for CJK extension A characters', () => {
    expect(isChinese('\u3400')).toBe(true);
    expect(isChinese('\u4DBF')).toBe(true);
  });

  it('returns false for ASCII characters', () => {
    expect(isChinese('A')).toBe(false);
    expect(isChinese('z')).toBe(false);
    expect(isChinese('5')).toBe(false);
  });

  it('returns false for punctuation and whitespace', () => {
    expect(isChinese(' ')).toBe(false);
    expect(isChinese('.')).toBe(false);
    expect(isChinese('，')).toBe(false);
  });
});

describe('detectLanguage', () => {
  it('detects English text', () => {
    expect(detectLanguage('Hello world, this is a test.')).toBe('en');
  });

  it('detects Chinese text', () => {
    expect(detectLanguage('这是一个中文测试句子')).toBe('zh');
  });

  it('detects mixed text as Chinese when majority is Chinese', () => {
    expect(detectLanguage('这是一个test测试')).toBe('zh');
  });

  it('detects mixed text as English when majority is English', () => {
    expect(detectLanguage('This is a long English sentence with one 字')).toBe('en');
  });

  it('returns en for empty text', () => {
    expect(detectLanguage('')).toBe('en');
  });

  it('returns en for whitespace-only text', () => {
    expect(detectLanguage('   ')).toBe('en');
  });

  it('returns en for numbers only', () => {
    expect(detectLanguage('12345')).toBe('en');
  });
});

describe('splitByLanguage', () => {
  it('returns single English segment for English text', () => {
    const result = splitByLanguage('Hello world');
    expect(result).toEqual([{ text: 'Hello world', lang: 'en' }]);
  });

  it('returns single Chinese segment for Chinese text', () => {
    const result = splitByLanguage('你好世界');
    expect(result).toEqual([{ text: '你好世界', lang: 'zh' }]);
  });

  it('merges short English words into Chinese context', () => {
    // Short English words next to Chinese are merged (names, terms)
    const result = splitByLanguage('Hello 你好 World');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('zh');
    expect(result[0].text).toContain('你好');
    expect(result[0].text).toContain('Hello');
  });

  it('splits long English from Chinese', () => {
    // Long English passages stay separate
    const result = splitByLanguage('This is a long English sentence here 你好');
    expect(result.length).toBeGreaterThanOrEqual(2);
    const enSeg = result.find(s => s.lang === 'en');
    expect(enSeg).toBeDefined();
  });

  it('returns empty array for empty text', () => {
    expect(splitByLanguage('')).toEqual([]);
  });

  it('handles text with only punctuation and spaces', () => {
    const result = splitByLanguage('... ---');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('en');
  });

  it('preserves all text content', () => {
    const input = 'Hello 你好 World 世界';
    const result = splitByLanguage(input);
    const reconstructed = result.map(s => s.text).join('');
    expect(reconstructed).toBe(input);
  });

  it('keeps digits attached to surrounding Chinese context', () => {
    const result = splitByLanguage('他有3个苹果');
    // Should be one Chinese segment, not split at the digit
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('zh');
    expect(result[0].text).toBe('他有3个苹果');
  });

  it('keeps digits attached to surrounding English context', () => {
    const result = splitByLanguage('Chapter 12 begins');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('en');
  });

  it('keeps multi-digit numbers in Chinese context', () => {
    const result = splitByLanguage('共100页');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('zh');
  });

  it('keeps short English names embedded in Chinese as Chinese', () => {
    const result = splitByLanguage('苹果公司Apple发布了新产品');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('zh');
    expect(result[0].text).toContain('Apple');
  });

  it('keeps brand names like iPhone in Chinese context', () => {
    const result = splitByLanguage('他买了一台iPhone 15');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('zh');
  });

  it('keeps company names like Google in Chinese context', () => {
    const result = splitByLanguage('Google是一家美国公司');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('zh');
  });

  it('keeps short English abbreviations in Chinese', () => {
    const result = splitByLanguage('他在MIT读书');
    expect(result.length).toBe(1);
    expect(result[0].lang).toBe('zh');
  });

  it('still splits long English sentences from Chinese', () => {
    const result = splitByLanguage('前言 This is a full English sentence that should be separate 结尾');
    expect(result.length).toBeGreaterThan(1);
    const enSeg = result.find(s => s.lang === 'en');
    expect(enSeg).toBeDefined();
    expect(enSeg.text).toContain('This is a full English sentence');
  });

  it('preserves all text when merging short segments', () => {
    const input = '使用Python和JavaScript编程';
    const result = splitByLanguage(input);
    const reconstructed = result.map(s => s.text).join('');
    expect(reconstructed).toBe(input);
  });
});
