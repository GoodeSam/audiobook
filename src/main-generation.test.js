/**
 * Characterization tests for the generation and resume chain in main.js.
 *
 * This is where the recurring bugs live: a run dies and the retry either
 * restarts from zero or leaves the chapter looking untouched. Each test records
 * one link in that chain so the coming extraction cannot quietly break it.
 *
 * Nothing in main.js was changed to make these possible — a safety net has to
 * pin down the code as it is today, before any restructuring.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootApp } from './test-fixtures/app-harness.js';

// Everything that touches the network, IndexedDB, or a WebSocket is mocked.
// Each already has its own test file; what is under test here is the
// orchestration that wires them together. `vi.mock` is hoisted per file, so
// these must be declared here rather than inside the harness.
vi.mock('./db.js');
vi.mock('./remote-library.js');
vi.mock('./library-api.js');
vi.mock('./edge-tts.js');
vi.mock('./ms-translator.js');
vi.mock('./publish-export.js');

const boot = bootApp;

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

  // The durability promise: at every instant there is either a resumable
  // checkpoint or a finished MP3 on disk. Deleting the checkpoint before the
  // MP3 write is confirmed opens a window where a failed write leaves neither,
  // and the chapter silently reverts to "never generated".
  it('keeps the checkpoint when the finished MP3 fails to save', async () => {
    const { state, edgeTts, db } = await boot();
    const mode = document.getElementById('audio-mode-select').value;
    oneChapterBook(state);

    edgeTts.generateChapterAudio.mockImplementation(async (opts) => {
      await opts.onCheckpoint({
        completedIndex: 100, totalSegments: 100, audioMode: mode,
        audioBlobs: Array.from({ length: 100 }, () => new Blob(['seg'])),
      });
      return { blob: new Blob(['mp3']), timeline: null };
    });
    // Quota exhausted, or a blocked database — the write that must land, doesn't.
    db.saveChapterAudio.mockRejectedValue(new Error('QuotaExceededError'));

    document.getElementById('btn-generate-chapter').click();
    await vi.waitFor(() => expect(db.saveChapterAudio).toHaveBeenCalled());
    await vi.waitFor(() => expect(state.generating).toBe(false));

    // The resume point must survive, in memory and on disk.
    expect(db.deleteAudioCheckpoint).not.toHaveBeenCalled();
    expect(state.audioCheckpoints[0]?.[mode]).toBeTruthy();
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
