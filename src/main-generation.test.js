/**
 * Feasibility spike: can main.js be driven from a test at all?
 *
 * main.js is 2915 lines with no tests, and it is where the recurring
 * generation/resume/publish bugs live. Before writing characterization tests
 * for that orchestration, this proves a harness is possible: real index.html
 * DOM, I/O leaves mocked, module imported for its side effects, then driven by
 * clicking the same buttons a user clicks.
 *
 * Nothing in main.js changes to make this work — that is the point. A safety
 * net has to pin down the code as it is today, before any restructuring.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(here, '..', 'index.html'), 'utf8');

// Everything that touches the network, IndexedDB, or a WebSocket is mocked.
// Each already has its own test file; what is under test here is the
// orchestration that wires them together.
vi.mock('./db.js');
vi.mock('./remote-library.js');
vi.mock('./library-api.js');
vi.mock('./edge-tts.js');
vi.mock('./ms-translator.js');

/** This jsdom build ships a non-functional localStorage, and main.js reads it
 *  at module scope — so a working one must exist before the import. */
function installLocalStorage() {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  });
}

/**
 * Boot a fresh instance of the app.
 *
 * `resetModules` matters: main.js attaches 65 listeners at import time, so a
 * cached module plus a rebuilt DOM would leave every button dead.
 */
async function boot({ admin = true } = {}) {
  vi.resetModules();
  installLocalStorage();
  // Generation and publishing are admin actions. Without this the app boots
  // into listener mode, where chapter rows render the listener view ("文本",
  // "☁️ 可听") and never reach the admin status branches at all.
  if (admin) window.localStorage.setItem('audiobook.adminMode', '1');

  // The real app shell, so ids and structure match production exactly.
  const body = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');

  const db = await import('./db.js');
  const remote = await import('./remote-library.js');
  const edgeTts = await import('./edge-tts.js');

  db.listUsers.mockResolvedValue([{ id: 'u1', name: 'Default' }]);
  db.createUser.mockResolvedValue({ id: 'u1', name: 'Default' });
  db.listBooks.mockResolvedValue([]);
  db.getBookAudio.mockResolvedValue([]);
  db.getBookAudioCheckpoints.mockResolvedValue([]);
  db.openDatabase.mockResolvedValue({});
  db.saveChapterAudio.mockResolvedValue(undefined);
  remote.fetchCatalog.mockResolvedValue({ books: [] });
  remote.visibleBooks.mockReturnValue([]);
  remote.isKnownCode.mockReturnValue(false);
  edgeTts.validateVoiceSettings.mockReturnValue(null);

  await import('./main.js');
  return { db, remote, edgeTts, ...window.__audiobook };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('main.js harness', () => {
  it('boots without throwing and exposes its debug hook', async () => {
    const { state } = await boot();
    expect(state).toBeDefined();
  });

  // The harness is only useful if it can drive the layer the bugs live in.
  it('drives a real generation run through the Generate button', async () => {
    const { state, edgeTts, db } = await boot();
    edgeTts.generateChapterAudio.mockResolvedValue({
      blob: new Blob(['mp3']), timeline: null,
    });

    state.bookId = 'book-1';
    state.book = { title: 'T', chapters: [{ title: 'Ch1', markdown: '# Hello' }] };
    state.activeChapter = 0;

    document.getElementById('btn-generate-chapter').click();
    await vi.waitFor(() => expect(edgeTts.generateChapterAudio).toHaveBeenCalled());

    const args = edgeTts.generateChapterAudio.mock.calls[0][0];
    expect(args.originalText).toBe('# Hello');
    expect(args.audioMode).toBe(document.getElementById('audio-mode-select').value);
    // A fresh chapter has no stored checkpoint, so the run starts clean.
    expect(args.checkpoint).toBeFalsy();

    // The generated chapter reaches storage — the step whose silent failure
    // made publish report "还没有生成音频".
    await vi.waitFor(() => expect(db.saveChapterAudio).toHaveBeenCalled());
    expect(state.audioBlobs[0]).toBeInstanceOf(Blob);
  });
});

/**
 * The resume chain, pinned as it behaves today.
 *
 * This is the path that kept regressing: a run dies, and the retry either
 * restarts from zero or leaves the chapter looking untouched. Each test below
 * records one link in that chain so a refactor cannot quietly break it.
 */
describe('resuming an interrupted chapter', () => {
  const oneChapterBook = (state) => {
    state.bookId = 'book-1';
    state.book = { title: 'T', chapters: [{ title: 'Ch1', markdown: '# Hello' }] };
    state.activeChapter = 0;
  };

  // Drives the whole real path: reopen the book from the library, which is
  // what pulls disk checkpoints back into memory, then press Generate.
  it('hands a stored checkpoint to the generator instead of starting over', async () => {
    const { state, edgeTts, db, renderLibrary } = await boot();
    const mode = document.getElementById('audio-mode-select').value;
    const stored = {
      id: 'book-1', title: 'T', chapters: [{ title: 'Ch1', markdown: '# Hello' }],
    };
    db.listBooks.mockResolvedValue([stored]);
    db.getBook.mockResolvedValue(stored);
    // What a killed run leaves behind on disk.
    db.getBookAudioCheckpoints.mockResolvedValue([{
      bookId: 'book-1', chapterIndex: 0, audioMode: mode,
      completedIndex: 40, totalSegments: 100,
      audioBlobs: Array.from({ length: 40 }, () => new Blob(['seg'])),
    }]);
    edgeTts.generateChapterAudio.mockResolvedValue({ blob: new Blob(['mp3']), timeline: null });

    await renderLibrary();
    const openBtn = [...document.querySelectorAll('.library-actions button')]
      .find(b => b.textContent === 'Open');
    expect(openBtn, 'library rendered an Open button').toBeTruthy();
    openBtn.click();
    await vi.waitFor(() => expect(state.audioCheckpoints[0]?.[mode]).toBeTruthy());

    state.activeChapter = 0;
    document.getElementById('btn-generate-chapter').click();
    await vi.waitFor(() => expect(edgeTts.generateChapterAudio).toHaveBeenCalled());

    const { checkpoint } = edgeTts.generateChapterAudio.mock.calls[0][0];
    expect(checkpoint).toBeTruthy();
    expect(checkpoint.completedIndex).toBe(40);
    expect(checkpoint.audioMode).toBe(mode);
  });

  it('keeps the checkpoint when a run fails, so the retry can resume', async () => {
    const { state, edgeTts } = await boot();
    const mode = document.getElementById('audio-mode-select').value;
    oneChapterBook(state);

    // The generator records progress, then dies — a dropped WebSocket.
    edgeTts.generateChapterAudio.mockImplementation(async (opts) => {
      await opts.onCheckpoint({
        completedIndex: 7, totalSegments: 100, audioMode: mode,
        audioBlobs: Array.from({ length: 7 }, () => new Blob(['seg'])),
      });
      throw new Error('socket closed');
    });

    document.getElementById('btn-generate-chapter').click();
    // Wait for the run to have started before waiting for it to finish —
    // `generating` is false at click time, so the second wait alone races.
    await vi.waitFor(() => expect(edgeTts.generateChapterAudio).toHaveBeenCalled());
    await vi.waitFor(() => expect(state.generating).toBe(false));

    // In memory, so the same session resumes...
    expect(state.audioCheckpoints[0][mode].completedIndex).toBe(7);
    // ...and the chapter row says so rather than looking finished.
    expect(document.getElementById('chapter-list').textContent).toContain('已中断');
  });

  it('writes the first segment to disk, so even a very early death leaves a trace', async () => {
    const { state, edgeTts, db } = await boot();
    const mode = document.getElementById('audio-mode-select').value;
    oneChapterBook(state);

    edgeTts.generateChapterAudio.mockImplementation(async (opts) => {
      await opts.onCheckpoint({
        completedIndex: 1, totalSegments: 100, audioMode: mode,
        audioBlobs: [new Blob(['seg'])],
      });
      throw new Error('killed at segment 1');
    });

    document.getElementById('btn-generate-chapter').click();
    await vi.waitFor(() => expect(db.saveAudioCheckpoint).toHaveBeenCalled());

    const [bookId, chapterIndex, cp] = db.saveAudioCheckpoint.mock.calls[0];
    expect(bookId).toBe('book-1');
    expect(chapterIndex).toBe(0);
    expect(cp.completedIndex).toBe(1);
  });

  it('refuses to start when storage is unusable rather than synthesizing for nothing', async () => {
    const { state, edgeTts, db } = await boot();
    db.openDatabase.mockRejectedValue(new Error('数据库被本站的其他标签页占用'));
    oneChapterBook(state);

    document.getElementById('btn-generate-chapter').click();
    await vi.waitFor(() => expect(db.openDatabase).toHaveBeenCalled());

    expect(edgeTts.generateChapterAudio).not.toHaveBeenCalled();
    expect(state.generating).toBe(false);
  });
});
