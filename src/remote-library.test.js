import { describe, it, expect } from 'vitest';
import { visibleBooks, isKnownCode } from './remote-library.js';
import { buildPublishManifest, countAudioChapters } from './publish-export.js';

const catalog = {
  books: [
    { id: 'book-a', title: 'Book A', access: ['alice', 'bob'], updatedAt: 100 },
    { id: 'book-b', title: 'Book B', access: 'public', updatedAt: 200 },
    { id: 'book-c', title: 'Book C', access: ['Alice'], updatedAt: 300 },
  ],
};

describe('visibleBooks', () => {
  it('shows public books plus books assigned to the code', () => {
    const books = visibleBooks(catalog, 'alice');
    expect(books.map(b => b.id)).toEqual(['book-c', 'book-b', 'book-a']);
  });

  it('matches access codes case-insensitively', () => {
    const books = visibleBooks(catalog, 'ALICE');
    expect(books.map(b => b.id)).toContain('book-c');
  });

  it('shows only public books without a code', () => {
    expect(visibleBooks(catalog, '').map(b => b.id)).toEqual(['book-b']);
  });

  it('shows only public books for an unknown code', () => {
    expect(visibleBooks(catalog, 'stranger').map(b => b.id)).toEqual(['book-b']);
  });

  it('sorts newest first', () => {
    const books = visibleBooks(catalog, 'bob');
    expect(books.map(b => b.id)).toEqual(['book-b', 'book-a']);
  });

  it('handles empty or malformed catalogs', () => {
    expect(visibleBooks(null, 'alice')).toEqual([]);
    expect(visibleBooks({}, 'alice')).toEqual([]);
  });
});

describe('isKnownCode', () => {
  it('accepts codes assigned to at least one book', () => {
    expect(isKnownCode(catalog, 'alice')).toBe(true);
    expect(isKnownCode(catalog, 'BOB')).toBe(true);
  });

  it('rejects unknown or empty codes', () => {
    expect(isKnownCode(catalog, 'stranger')).toBe(false);
    expect(isKnownCode(catalog, '')).toBe(false);
    expect(isKnownCode(null, 'alice')).toBe(false);
  });
});

describe('buildPublishManifest', () => {
  const book = {
    title: 'My Book',
    chapters: [
      { title: 'One', markdown: 'Text one.', translatedMarkdown: '译文一。' },
      { title: 'Two', markdown: 'Text two.', translatedMarkdown: null },
    ],
  };
  const blobs = { 0: new Blob(['x']) };
  const timelines = { 0: [{ start: 0, end: 1, lang: 'en', paraIndex: 0, text: 'Text one.' }] };
  const modes = { 0: 'bilingual' };

  it('sets audioFile only for chapters with audio', () => {
    const m = buildPublishManifest(book, 'my-book', blobs, timelines, modes);
    expect(m.id).toBe('my-book');
    expect(m.chapters[0].audioFile).toBe('001.mp3');
    expect(m.chapters[0].audioMode).toBe('bilingual');
    expect(m.chapters[0].timeline.length).toBe(1);
    expect(m.chapters[1].audioFile).toBeNull();
    expect(m.chapters[1].timeline).toBeNull();
  });

  it('preserves markdown and translations', () => {
    const m = buildPublishManifest(book, 'my-book', blobs);
    expect(m.chapters[0].markdown).toBe('Text one.');
    expect(m.chapters[0].translatedMarkdown).toBe('译文一。');
    expect(m.chapters[1].translatedMarkdown).toBeNull();
  });

  it('counts audio chapters', () => {
    const m = buildPublishManifest(book, 'my-book', blobs);
    expect(countAudioChapters(m)).toBe(1);
  });
});
