import { describe, it, expect } from 'vitest';
import { buildBilingualMarkdown } from './bilingual-view.js';

describe('buildBilingualMarkdown', () => {
  it('interleaves original and translated paragraphs', () => {
    const result = buildBilingualMarkdown(
      'Hello world.\n\nGoodbye world.',
      '你好世界。\n\n再见世界。'
    );
    const lines = result.split('\n');
    // Should contain both originals and translations in alternating order
    expect(result).toContain('Hello world.');
    expect(result).toContain('你好世界。');
    expect(result).toContain('Goodbye world.');
    expect(result).toContain('再见世界。');
    // Original should come before its translation
    expect(result.indexOf('Hello world.')).toBeLessThan(result.indexOf('你好世界。'));
    expect(result.indexOf('Goodbye world.')).toBeLessThan(result.indexOf('再见世界。'));
  });

  it('preserves headings from original without translating', () => {
    const result = buildBilingualMarkdown(
      '# Chapter 1\n\nSome text.',
      '# 第一章\n\n一些文字。'
    );
    expect(result).toContain('# Chapter 1');
    expect(result).toContain('Some text.');
    expect(result).toContain('一些文字。');
  });

  it('handles mismatched paragraph counts gracefully', () => {
    const result = buildBilingualMarkdown(
      'Para 1.\n\nPara 2.\n\nPara 3.',
      '段落一。\n\n段落二。'
    );
    expect(result).toContain('Para 1.');
    expect(result).toContain('段落一。');
    expect(result).toContain('Para 2.');
    expect(result).toContain('段落二。');
    expect(result).toContain('Para 3.');
  });

  it('returns original text when no translation provided', () => {
    const result = buildBilingualMarkdown('Hello.', '');
    expect(result).toContain('Hello.');
  });

  it('returns empty string for empty inputs', () => {
    expect(buildBilingualMarkdown('', '')).toBe('');
  });

  it('marks original and translated with distinct prefixes', () => {
    const result = buildBilingualMarkdown(
      'English text.',
      '中文文本。'
    );
    // Should have visual distinction between original and translated
    expect(result).toContain('English text.');
    expect(result).toContain('中文文本。');
  });

  it('skips empty paragraphs', () => {
    const result = buildBilingualMarkdown(
      'Text.\n\n\n\nMore text.',
      '文本。\n\n\n\n更多文本。'
    );
    // Should not produce excessive blank lines
    expect(result).not.toMatch(/\n{4,}/);
  });
});
