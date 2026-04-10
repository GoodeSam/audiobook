import { describe, it, expect } from 'vitest';
import { groupPagesIntoChapters, detectChapterBreak } from './pdf-parser.js';

describe('detectChapterBreak', () => {
  it('detects "Chapter N" pattern', () => {
    expect(detectChapterBreak('Chapter 1: Introduction')).toBe('Chapter 1: Introduction');
    expect(detectChapterBreak('CHAPTER 5')).toBe('CHAPTER 5');
    expect(detectChapterBreak('chapter 12 the beginning')).toBe('chapter 12 the beginning');
  });

  it('detects "Part N" pattern', () => {
    expect(detectChapterBreak('Part I')).toBe('Part I');
    expect(detectChapterBreak('PART THREE')).toBe('PART THREE');
  });

  it('detects Chinese chapter patterns', () => {
    expect(detectChapterBreak('第一章 引言')).toBe('第一章 引言');
    expect(detectChapterBreak('第3章 方法论')).toBe('第3章 方法论');
  });

  it('returns null for normal text', () => {
    expect(detectChapterBreak('This is a regular paragraph.')).toBe(null);
    expect(detectChapterBreak('The chapter discusses various topics.')).toBe(null);
  });

  it('returns null for empty text', () => {
    expect(detectChapterBreak('')).toBe(null);
    expect(detectChapterBreak('   ')).toBe(null);
  });
});

describe('groupPagesIntoChapters', () => {
  it('groups pages with chapter breaks', () => {
    const pages = [
      'Chapter 1\n\nFirst page content.',
      'More content on page two.',
      'Chapter 2\n\nSecond chapter starts here.',
      'Page four content.',
    ];
    const chapters = groupPagesIntoChapters(pages, 'Test Book');
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toContain('Chapter 1');
    expect(chapters[0].markdown).toContain('First page content');
    expect(chapters[0].markdown).toContain('More content');
    expect(chapters[1].title).toContain('Chapter 2');
  });

  it('creates page-based chapters when no chapter breaks found', () => {
    const pages = [
      'Page one content.',
      'Page two content.',
      'Page three content.',
    ];
    const chapters = groupPagesIntoChapters(pages, 'Test Book');
    // Without chapter breaks, groups pages (default ~10 pages per chapter)
    expect(chapters.length).toBeGreaterThanOrEqual(1);
    expect(chapters[0].markdown).toContain('Page one content');
  });

  it('handles single page', () => {
    const pages = ['Only page.'];
    const chapters = groupPagesIntoChapters(pages, 'Test Book');
    expect(chapters.length).toBe(1);
    expect(chapters[0].markdown).toContain('Only page');
  });

  it('handles empty pages array', () => {
    const chapters = groupPagesIntoChapters([], 'Test Book');
    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe('Test Book');
  });

  it('uses book title for first chapter if no break detected', () => {
    const pages = ['Just some text.'];
    const chapters = groupPagesIntoChapters(pages, 'My Book');
    expect(chapters[0].title).toBe('My Book');
  });
});
