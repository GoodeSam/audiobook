/**
 * Characterization tests for reopening a book and publishing it.
 *
 * These are the other two places bugs landed: audio that existed on disk but
 * never made it back into memory, and a publish that reported "还没有生成音频"
 * for a book that really had been generated. Restore is also what turns
 * "regenerate" back into "resume", so it guards the generation chain too.
 *
 * Nothing in main.js was changed to make these possible.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { bootApp, toastText } from './test-fixtures/app-harness.js';

vi.mock('./db.js');
vi.mock('./remote-library.js');
vi.mock('./library-api.js');
vi.mock('./edge-tts.js');
vi.mock('./ms-translator.js');
vi.mock('./publish-export.js');

afterEach(() => {
  vi.clearAllMocks();
});

const BOOK = {
  id: 'book-1',
  title: '测试书',
  chapters: [
    { title: 'Ch1', markdown: '# One' },
    { title: 'Ch2', markdown: '# Two' },
  ],
};

/** Open a book through the library's real "Open" button. */
async function openFromLibrary({ db, renderLibrary }) {
  db.listBooks.mockResolvedValue([BOOK]);
  db.getBook.mockResolvedValue(BOOK);
  await renderLibrary();
  const openBtn = [...document.querySelectorAll('.library-actions button')]
    .find(b => b.textContent === 'Open');
  expect(openBtn, 'library rendered an Open button').toBeTruthy();
  openBtn.click();
}

describe('reopening a book restores what is on disk', () => {
  it('brings back every audio mode a chapter has, not just one', async () => {
    const app = await bootApp();
    const { db, state } = app;
    db.getBookAudio.mockResolvedValue([
      { chapterIndex: 0, audioMode: 'original', blob: new Blob(['a']), timeline: null, updatedAt: 1 },
      { chapterIndex: 0, audioMode: 'bilingual', blob: new Blob(['b']), timeline: null, updatedAt: 2 },
    ]);

    await openFromLibrary(app);
    await vi.waitFor(() => expect(state.audioVariants[0]?.original).toBeTruthy());

    expect(state.audioVariants[0].bilingual).toBeTruthy();
    // The most recently generated mode becomes the "current" one that the
    // single-mode UI (preview, download, publish default) reads.
    expect(state.audioModes[0]).toBe('bilingual');
    expect(state.audioBlobs[0]).toBe(state.audioVariants[0].bilingual.blob);
  });

  it('restores a partial chapter as a resumable checkpoint', async () => {
    const app = await bootApp();
    const { db, state } = app;
    db.getBookAudioCheckpoints.mockResolvedValue([{
      bookId: 'book-1', chapterIndex: 1, audioMode: 'original',
      completedIndex: 12, totalSegments: 60,
      audioBlobs: Array.from({ length: 12 }, () => new Blob(['seg'])),
    }]);

    await openFromLibrary(app);
    await vi.waitFor(() => expect(state.audioCheckpoints[1]?.original).toBeTruthy());

    expect(state.audioCheckpoints[1].original.completedIndex).toBe(12);
  });

  // Otherwise a stale checkpoint outlives the audio it was superseded by and
  // keeps claiming the chapter is unfinished.
  it('discards a checkpoint whose chapter and mode already finished', async () => {
    const app = await bootApp();
    const { db, state } = app;
    db.getBookAudio.mockResolvedValue([
      { chapterIndex: 0, audioMode: 'original', blob: new Blob(['a']), timeline: null, updatedAt: 1 },
    ]);
    db.getBookAudioCheckpoints.mockResolvedValue([{
      bookId: 'book-1', chapterIndex: 0, audioMode: 'original',
      completedIndex: 5, totalSegments: 60,
      audioBlobs: [new Blob(['seg'])],
    }]);

    await openFromLibrary(app);
    await vi.waitFor(() => expect(db.deleteAudioCheckpoint).toHaveBeenCalled());

    expect(db.deleteAudioCheckpoint).toHaveBeenCalledWith('book-1', 0, 'original');
    expect(state.audioCheckpoints[0]?.original).toBeFalsy();
  });
});

describe('publishing to the site', () => {
  it('refuses to open when the book has no audio in memory', async () => {
    const app = await bootApp();
    const { state } = app;
    state.book = BOOK;
    state.bookId = BOOK.id;

    document.getElementById('btn-publish-site').click();

    expect(toastText()).toContain('还没有生成音频');
    expect(document.getElementById('publish-modal').hidden).toBe(true);
  });

  // Restore is the bridge: audio on disk only counts as "generated" for publish
  // once reopening the book has pulled it back into memory.
  it('opens once reopening the book has restored its audio', async () => {
    const app = await bootApp();
    const { db } = app;
    db.getBookAudio.mockResolvedValue([
      { chapterIndex: 0, audioMode: 'original', blob: new Blob(['a']), timeline: null, updatedAt: 1 },
    ]);

    await openFromLibrary(app);
    await vi.waitFor(() => expect(app.state.audioBlobs[0]).toBeTruthy());

    document.getElementById('btn-publish-site').click();

    expect(toastText()).not.toContain('还没有生成音频');
    expect(document.getElementById('publish-modal').hidden).toBe(false);
    expect(document.getElementById('publish-modal-info').textContent).toContain('1 段音频');
  });

  it('packages every generated mode, not just the current one', async () => {
    const app = await bootApp();
    const { db, publishExport, api, state } = app;
    db.getBookAudio.mockResolvedValue([
      { chapterIndex: 0, audioMode: 'original', blob: new Blob(['a']), timeline: null, updatedAt: 1 },
      { chapterIndex: 0, audioMode: 'bilingual', blob: new Blob(['b']), timeline: null, updatedAt: 2 },
    ]);
    publishExport.buildPublishZip.mockResolvedValue({ blob: new Blob(['zip']), manifest: {} });
    publishExport.countAudioChapters.mockReturnValue(1);
    api.uploadPublishZip.mockResolvedValue({
      book: { id: 'pub-1', title: BOOK.title, chapterCount: 2, access: 'public' },
    });

    await openFromLibrary(app);
    await vi.waitFor(() => expect(state.audioBlobs[0]).toBeTruthy());

    document.getElementById('btn-publish-site').click();
    document.getElementById('publish-token-input').value = 'secret';
    document.getElementById('btn-publish-confirm').click();
    await vi.waitFor(() => expect(publishExport.buildPublishZip).toHaveBeenCalled());

    const variants = publishExport.buildPublishZip.mock.calls[0][2];
    expect(Object.keys(variants[0])).toEqual(
      expect.arrayContaining(['original', 'bilingual']),
    );
  });

  it('will not upload without an admin password', async () => {
    const app = await bootApp();
    const { db, api, publishExport } = app;
    db.getBookAudio.mockResolvedValue([
      { chapterIndex: 0, audioMode: 'original', blob: new Blob(['a']), timeline: null, updatedAt: 1 },
    ]);
    publishExport.buildPublishZip.mockResolvedValue({ blob: new Blob(['zip']), manifest: {} });

    await openFromLibrary(app);
    await vi.waitFor(() => expect(app.state.audioBlobs[0]).toBeTruthy());

    document.getElementById('btn-publish-site').click();
    document.getElementById('publish-token-input').value = '';
    document.getElementById('btn-publish-confirm').click();

    expect(document.getElementById('publish-modal-status').textContent).toContain('管理员密码');
    expect(api.uploadPublishZip).not.toHaveBeenCalled();
  });

  // The promise made in the failure message: "书籍和音频仍在本机，不会丢失".
  it('leaves local books and audio untouched when the upload fails', async () => {
    const app = await bootApp();
    const { db, api, publishExport, state } = app;
    db.getBookAudio.mockResolvedValue([
      { chapterIndex: 0, audioMode: 'original', blob: new Blob(['a']), timeline: null, updatedAt: 1 },
    ]);
    publishExport.buildPublishZip.mockResolvedValue({ blob: new Blob(['zip']), manifest: {} });
    api.uploadPublishZip.mockRejectedValue(new Error('network down'));

    await openFromLibrary(app);
    await vi.waitFor(() => expect(state.audioBlobs[0]).toBeTruthy());

    document.getElementById('btn-publish-site').click();
    document.getElementById('publish-token-input').value = 'secret';
    document.getElementById('btn-publish-confirm').click();
    await vi.waitFor(() =>
      expect(document.getElementById('publish-result').textContent).toContain('发布失败'));

    expect(state.audioBlobs[0]).toBeTruthy();
    expect(state.audioVariants[0].original).toBeTruthy();
    expect(db.deleteBook).not.toHaveBeenCalled();
    expect(db.deleteChapterAudioVariant).not.toHaveBeenCalled();
    // Retry stays available rather than the modal closing on the user.
    expect(document.getElementById('btn-publish-confirm').disabled).toBe(false);
  });

  it('clears a rejected admin password so the retry asks for it again', async () => {
    const app = await bootApp();
    const { db, api, publishExport } = app;
    db.getBookAudio.mockResolvedValue([
      { chapterIndex: 0, audioMode: 'original', blob: new Blob(['a']), timeline: null, updatedAt: 1 },
    ]);
    publishExport.buildPublishZip.mockResolvedValue({ blob: new Blob(['zip']), manifest: {} });
    const err = new Error('bad token');
    err.badToken = true;
    api.uploadPublishZip.mockRejectedValue(err);

    await openFromLibrary(app);
    await vi.waitFor(() => expect(app.state.audioBlobs[0]).toBeTruthy());

    document.getElementById('btn-publish-site').click();
    document.getElementById('publish-token-input').value = 'wrong';
    document.getElementById('btn-publish-confirm').click();
    await vi.waitFor(() =>
      expect(document.getElementById('publish-result').textContent).toContain('发布失败'));

    expect(document.getElementById('publish-token-input').value).toBe('');
  });
});
