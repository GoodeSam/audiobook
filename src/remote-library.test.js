import { describe, it, expect } from 'vitest';
import { visibleBooks, isKnownCode } from './remote-library.js';

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

  it('accepts pre-registered codes even with no books assigned', () => {
    const withCodes = { ...catalog, validCodes: ['beko288', 'CAZO678'] };
    expect(isKnownCode(withCodes, 'beko288')).toBe(true);
    expect(isKnownCode(withCodes, 'BEKO288')).toBe(true);
    expect(isKnownCode(withCodes, 'cazo678')).toBe(true);
  });

  it('rejects unknown or empty codes', () => {
    expect(isKnownCode(catalog, 'stranger')).toBe(false);
    expect(isKnownCode(catalog, '')).toBe(false);
    expect(isKnownCode(null, 'alice')).toBe(false);
  });
});

describe('fetchRemoteAudio download progress', () => {
  function mockStreamResponse(chunks, contentLength) {
    let i = 0;
    return {
      ok: true,
      headers: { get: (h) => (h === 'content-length' ? String(contentLength) : null) },
      body: {
        getReader: () => ({
          read: async () =>
            i < chunks.length ? { done: false, value: chunks[i++] } : { done: true },
        }),
      },
      blob: async () => new Blob(chunks, { type: 'audio/mpeg' }),
    };
  }

  it('streams chunks and reports loaded/total bytes', async () => {
    const chunks = [new Uint8Array(1000), new Uint8Array(500)];
    const orig = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse(chunks, 1500);
    try {
      const { fetchRemoteAudio } = await import('./remote-library.js');
      const events = [];
      const blob = await fetchRemoteAudio('book-x', '001.mp3', '', {
        onProgress: (loaded, total) => events.push([loaded, total]),
      });
      expect(events).toEqual([[1000, 1500], [1500, 1500]]);
      expect(blob.size).toBe(1500);
      expect(blob.type).toBe('audio/mpeg');
    } finally {
      globalThis.fetch = orig;
    }
  });

  it('falls back to res.blob() when no onProgress is given', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async () => mockStreamResponse([new Uint8Array(10)], 10);
    try {
      const { fetchRemoteAudio } = await import('./remote-library.js');
      const blob = await fetchRemoteAudio('book-x', '001.mp3');
      expect(blob.size).toBe(10);
    } finally {
      globalThis.fetch = orig;
    }
  });
});
