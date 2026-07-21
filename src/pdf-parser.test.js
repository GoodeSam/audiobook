import { describe, it, expect } from 'vitest';
import { groupPagesIntoChapters, detectChapterBreak, joinTextItems } from './pdf-parser.js';

describe('joinTextItems', () => {
  // Mimics real pdf.js TextItem shape: transform[4]/[5] are x/y, width is
  // the glyph run's rendered width, height approximates font size.
  const item = (str, x, y, width, height = 15) => ({ str, transform: [1, 0, 0, 1, x, y], width, height });

  it('glues a ligature glyph run to its word with no inserted space', () => {
    // "fi" rendered as a separate zero-gap item, as real PDFs do — must
    // rejoin into "fish", not "fi sh".
    const items = [
      item('Heron liked the big', 0, 100, 100),
      item('fi', 104.6, 100, 8.34),
      item('sh, and Hummingbird liked', 112.94, 100, 150),
    ];
    expect(joinTextItems(items)).toBe('Heron liked the big fish, and Hummingbird liked');
  });

  it('inserts a space at a real word boundary (item gap ≈ space width)', () => {
    const items = [
      item('eat', 0, 100, 20),
      item('fish from the lake', 24.6, 100, 100), // ~4.6pt gap, same as the real PDF
    ];
    expect(joinTextItems(items)).toBe('eat fish from the lake');
  });

  it('inserts a space (not nothing) when wrapping to a new line', () => {
    const items = [
      item('they were', 0, 100, 50),
      item('good friends', 0, 85, 60), // new line — different y, x resets to line start
    ];
    expect(joinTextItems(items)).toBe('they were good friends');
  });

  it('skips items with empty str', () => {
    const items = [
      item('Hello', 0, 100, 30),
      item('', 30, 100, 0),
      item(' world', 30, 100, 30),
    ];
    expect(joinTextItems(items)).toBe('Hello world');
  });

  it('handles an empty item list', () => {
    expect(joinTextItems([])).toBe('');
  });
});

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
