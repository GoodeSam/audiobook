/**
 * Characterization tests for uploading a book and translating it.
 *
 * Lower bug density than the generation and publish chains, but two of the
 * rules here are quietly load-bearing and easy to break by accident:
 *
 *  - book identity. Re-uploading the same file must reuse the same id so its
 *    saved translations and audio come back; a *different* book that happens to
 *    share a title must NOT inherit them.
 *  - translation checkpoints. They are the only resume point for the default
 *    sentence mode, which translates a whole chapter before any audio exists.
 *
 * Nothing in main.js was changed to make these possible.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootApp } from './test-fixtures/app-harness.js';

vi.mock('./db.js');
vi.mock('./remote-library.js');
vi.mock('./library-api.js');
vi.mock('./edge-tts.js');
vi.mock('./ms-translator.js');
vi.mock('./publish-export.js');
vi.mock('./epub-parser.js');

afterEach(() => {
  vi.clearAllMocks();
});

/** Feed a file through the real drop-zone change handler. */
function dropFile(name = 'book.epub') {
  const input = document.querySelector('#drop-zone input[type="file"]');
  expect(input, 'drop zone has a file input').toBeTruthy();
  const file = new File(['data'], name, { type: 'application/epub+zip' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

const chaptersOf = (...bodies) =>
  bodies.map((html, i) => ({ title: `Ch${i + 1}`, html }));

describe('uploading a book', () => {
  it('parses, splits and shows the reader', async () => {
    const app = await bootApp();
    const epub = await import('./epub-parser.js');
    epub.parseEPUB.mockResolvedValue({
      title: '一本书', chapters: chaptersOf('<p>One</p>', '<p>Two</p>'),
    });

    dropFile();
    await vi.waitFor(() => expect(app.state.book).toBeTruthy());

    expect(app.state.book.title).toBe('一本书');
    expect(app.state.book.chapters).toHaveLength(2);
    // Markdown was derived from the chapter HTML, and the raw html dropped.
    expect(app.state.book.chapters[0].markdown).toContain('One');
    expect(app.state.book.chapters[0].html).toBeUndefined();
    expect(document.getElementById('reader-screen').hidden).toBe(false);
  });

  // Same title AND same content: the same book, so its saved translations come
  // back rather than the user having to redo them.
  it('reuses the stored id and merges saved translations on re-upload', async () => {
    const app = await bootApp();
    const epub = await import('./epub-parser.js');
    const parsed = { title: '一本书', chapters: chaptersOf('<p>One</p>') };
    epub.parseEPUB.mockResolvedValue(parsed);

    dropFile();
    await vi.waitFor(() => expect(app.state.book).toBeTruthy());
    const firstId = app.state.bookId;

    // Second upload: storage now holds the same book, with a translation.
    app.db.getBook.mockImplementation(async (id) => (id === firstId ? {
      id: firstId,
      title: '一本书',
      chapters: app.state.book.chapters.map(ch => ({
        title: ch.title, markdown: ch.markdown, translatedMarkdown: '译文',
      })),
    } : null));
    epub.parseEPUB.mockResolvedValue({ title: '一本书', chapters: chaptersOf('<p>One</p>') });

    dropFile();
    await vi.waitFor(() =>
      expect(app.state.book.chapters[0].translatedMarkdown).toBe('译文'));

    expect(app.state.bookId).toBe(firstId);
  });

  // Same title, DIFFERENT content: a revised edition or an unrelated book.
  // Inheriting the other book's translations and audio would be silent
  // corruption, so it gets an id of its own.
  it('gives a different book with a colliding title its own id', async () => {
    const app = await bootApp();
    const epub = await import('./epub-parser.js');
    epub.parseEPUB.mockResolvedValue({ title: '一本书', chapters: chaptersOf('<p>One</p>') });

    dropFile();
    await vi.waitFor(() => expect(app.state.book).toBeTruthy());
    const firstId = app.state.bookId;

    app.db.getBook.mockImplementation(async (id) => (id === firstId ? {
      id: firstId, title: '一本书',
      chapters: [{ title: 'Ch1', markdown: 'One', translatedMarkdown: '旧译文' }],
    } : null));
    epub.parseEPUB.mockResolvedValue({
      title: '一本书', chapters: chaptersOf('<p>Completely different text</p>'),
    });

    dropFile();
    await vi.waitFor(() =>
      expect(app.state.book.chapters[0].markdown).toContain('Completely different'));

    expect(app.state.bookId).not.toBe(firstId);
    expect(app.state.book.chapters[0].translatedMarkdown).toBeFalsy();
  });

  it('reports a parse failure in the drop zone and stays ready for another file', async () => {
    const app = await bootApp();
    const epub = await import('./epub-parser.js');
    epub.parseEPUB.mockRejectedValue(new Error('corrupt archive'));

    dropFile();
    await vi.waitFor(() =>
      expect(document.getElementById('drop-zone').textContent).toContain('corrupt archive'));

    expect(app.state.book).toBeFalsy();
    // The concurrency guard must be released, or every later upload is ignored.
    expect(app.state.working).toBe(false);
    expect(document.querySelector('#drop-zone input[type="file"]')).toBeTruthy();
  });

  // Two layers guard this. While parsing, the drop zone's innerHTML is replaced
  // with a status line, so the file input is simply gone — but the drag-and-drop
  // listener lives on the zone itself and survives, so `state.working` is what
  // actually stops a concurrent parse. This drives that second path.
  it('ignores a second file dropped while one is still parsing', async () => {
    const app = await bootApp();
    const epub = await import('./epub-parser.js');
    let release;
    epub.parseEPUB.mockImplementation(() => new Promise((r) => {
      release = () => r({ title: '一本书', chapters: chaptersOf('<p>One</p>') });
    }));

    dropFile();
    await vi.waitFor(() => expect(app.state.working).toBe(true));
    expect(document.querySelector('#drop-zone input[type="file"]')).toBeNull();

    const zone = document.getElementById('drop-zone');
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', {
      value: { files: [new File(['x'], 'other.epub')] },
    });
    zone.dispatchEvent(ev);

    expect(epub.parseEPUB).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(app.state.book).toBeTruthy());
  });
});

describe('translating a chapter', () => {
  /** A loaded book with the given chapter selected. */
  function loadBook(state, chapters = [{ title: 'Ch1', markdown: '# One' }]) {
    state.bookId = 'book-1';
    state.book = { title: 'T', chapters };
    state.activeChapter = 0;
  }

  it('stores the translation and drops the checkpoint on success', async () => {
    const app = await bootApp();
    const ms = await import('./ms-translator.js');
    loadBook(app.state);
    app.state.translationCheckpoints[0] = { completedIndex: 3, translatedParagraphs: ['a'] };
    ms.translateChapter.mockResolvedValue('译好的正文');

    document.getElementById('btn-translate-chapter').click();
    await vi.waitFor(() => expect(app.state.book.chapters[0].translatedMarkdown).toBe('译好的正文'));

    expect(app.state.translationCheckpoints[0]).toBeUndefined();
    expect(app.state.generating).toBe(false);
  });

  // The only resume point the default sentence mode has.
  it('resumes from a stored translation checkpoint', async () => {
    const app = await bootApp();
    const ms = await import('./ms-translator.js');
    loadBook(app.state);
    app.state.translationCheckpoints[0] = {
      completedIndex: 12, translatedParagraphs: ['p1', 'p2'],
    };
    ms.translateChapter.mockResolvedValue('译好的正文');

    document.getElementById('btn-translate-chapter').click();
    await vi.waitFor(() => expect(ms.translateChapter).toHaveBeenCalled());

    const opts = ms.translateChapter.mock.calls[0][3];
    expect(opts.startIndex).toBe(12);
    expect(opts.existingTranslations).toEqual(['p1', 'p2']);
    // The persistent cache is wired in, so a resume re-reads rather than re-pays.
    expect(typeof opts.getCached).toBe('function');
    expect(typeof opts.putCached).toBe('function');
  });

  it('keeps the checkpoint when translation fails, so the retry resumes', async () => {
    const app = await bootApp();
    const ms = await import('./ms-translator.js');
    loadBook(app.state);
    ms.translateChapter.mockImplementation(async (text, from, to, opts) => {
      opts.onCheckpoint({ completedIndex: 8, translatedParagraphs: ['p1'] });
      throw new Error('429 rate limited');
    });

    document.getElementById('btn-translate-chapter').click();
    await vi.waitFor(() => expect(ms.translateChapter).toHaveBeenCalled());
    await vi.waitFor(() => expect(app.state.generating).toBe(false));

    expect(app.state.translationCheckpoints[0].completedIndex).toBe(8);
    expect(app.state.book.chapters[0].translatedMarkdown).toBeFalsy();
  });

  it('will not retranslate a finished chapter that has no checkpoint', async () => {
    const app = await bootApp();
    const ms = await import('./ms-translator.js');
    loadBook(app.state, [{ title: 'Ch1', markdown: '# One', translatedMarkdown: '已译' }]);

    document.getElementById('btn-translate-chapter').click();

    expect(ms.translateChapter).not.toHaveBeenCalled();
  });
});
