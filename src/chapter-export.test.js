import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  exportChapterAsMarkdown,
  exportMultipleChapters,
} from './chapter-export.js';

describe('sanitizeFilename', () => {
  it('replaces spaces with hyphens', () => {
    expect(sanitizeFilename('Chapter One')).toBe('Chapter-One');
  });

  it('removes unsafe characters', () => {
    expect(sanitizeFilename('Chapter: "The Beginning"')).toBe('Chapter-The-Beginning');
  });

  it('truncates to 50 characters', () => {
    const long = 'A'.repeat(60);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(50);
  });

  it('removes trailing hyphens after truncation', () => {
    const name = 'A'.repeat(49) + '-B';
    const result = sanitizeFilename(name);
    expect(result).not.toMatch(/-$/);
  });

  it('returns untitled for empty input', () => {
    expect(sanitizeFilename('')).toBe('untitled');
  });

  it('handles special characters', () => {
    expect(sanitizeFilename('Test!File?Name')).toBe('TestFileName');
  });
});

describe('exportChapterAsMarkdown', () => {
  it('returns filename and content', () => {
    const chapter = { title: 'Chapter 1', markdown: '# Chapter 1\n\nSome text.' };
    const result = exportChapterAsMarkdown(chapter);

    expect(result.filename).toBe('Chapter-1.md');
    expect(result.content).toBe('# Chapter 1\n\nSome text.');
  });

  it('sanitizes the title for filename', () => {
    const chapter = { title: 'Chapter: "Special"', markdown: 'text' };
    const result = exportChapterAsMarkdown(chapter);

    expect(result.filename).toBe('Chapter-Special.md');
  });
});

describe('exportMultipleChapters', () => {
  const chapters = [
    { title: 'Chapter 1', markdown: 'Content 1' },
    { title: 'Chapter 2', markdown: 'Content 2' },
    { title: 'Chapter 3', markdown: 'Content 3' },
  ];

  it('exports selected chapters by indices', () => {
    const result = exportMultipleChapters(chapters, [0, 2]);

    expect(result.length).toBe(2);
    expect(result[0].filename).toBe('001_Chapter-1.md');
    expect(result[0].content).toBe('Content 1');
    expect(result[1].filename).toBe('003_Chapter-3.md');
    expect(result[1].content).toBe('Content 3');
  });

  it('exports all chapters when no indices provided', () => {
    const result = exportMultipleChapters(chapters);

    expect(result.length).toBe(3);
    expect(result[0].filename).toBe('001_Chapter-1.md');
    expect(result[1].filename).toBe('002_Chapter-2.md');
    expect(result[2].filename).toBe('003_Chapter-3.md');
  });

  it('returns empty array for empty selection', () => {
    expect(exportMultipleChapters(chapters, [])).toEqual([]);
  });

  it('skips invalid indices', () => {
    const result = exportMultipleChapters(chapters, [0, 99]);
    expect(result.length).toBe(1);
  });

  it('includes translated markdown when available', () => {
    const chaps = [
      { title: 'Ch 1', markdown: 'English', translatedMarkdown: '中文' },
    ];
    const result = exportMultipleChapters(chaps, [0], { includeTranslation: true });

    expect(result.length).toBe(2);
    expect(result[0].filename).toBe('001_Ch-1.md');
    expect(result[0].content).toBe('English');
    expect(result[1].filename).toBe('001_Ch-1_translated.md');
    expect(result[1].content).toBe('中文');
  });

  it('includes bilingual markdown when requested', () => {
    const chaps = [
      { title: 'Ch 1', markdown: 'Hello.\n\nWorld.', translatedMarkdown: '你好。\n\n世界。' },
    ];
    const result = exportMultipleChapters(chaps, [0], { includeBilingual: true });

    expect(result.length).toBe(2);
    expect(result[0].filename).toBe('001_Ch-1.md');
    expect(result[1].filename).toBe('001_Ch-1_bilingual.md');
    expect(result[1].content).toContain('Hello.');
    expect(result[1].content).toContain('你好。');
    expect(result[1].content).toContain('World.');
    expect(result[1].content).toContain('世界。');
  });

  it('includes all three formats when both options set', () => {
    const chaps = [
      { title: 'Ch 1', markdown: 'Text.', translatedMarkdown: '文本。' },
    ];
    const result = exportMultipleChapters(chaps, [0], {
      includeTranslation: true,
      includeBilingual: true,
    });

    expect(result.length).toBe(3);
    expect(result[0].filename).toBe('001_Ch-1.md');
    expect(result[1].filename).toBe('001_Ch-1_translated.md');
    expect(result[2].filename).toBe('001_Ch-1_bilingual.md');
  });

  it('skips bilingual when no translation exists', () => {
    const chaps = [
      { title: 'Ch 1', markdown: 'Text.' },
    ];
    const result = exportMultipleChapters(chaps, [0], { includeBilingual: true });

    expect(result.length).toBe(1); // Only original
  });
});
