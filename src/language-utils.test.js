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

  it('splits mixed content into segments', () => {
    const result = splitByLanguage('Hello 你好 World');
    expect(result.length).toBeGreaterThanOrEqual(2);
    // First segment should be English
    expect(result[0].lang).toBe('en');
    // Should contain a Chinese segment
    const zhSegment = result.find(s => s.lang === 'zh');
    expect(zhSegment).toBeDefined();
    expect(zhSegment.text).toContain('你好');
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
});
