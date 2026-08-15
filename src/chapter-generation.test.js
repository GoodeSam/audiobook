/**
 * The chapter generation coordinator, tested without a DOM.
 *
 * This logic used to exist twice — once in generateSingleChapter, once in
 * generateMultipleChapters — and the copies drifted. Both bugs found in the
 * last two rounds were divergences between them: a repaint ordered wrongly in
 * one copy, and a commit order that destroyed the resume point in both. Owning
 * the sequence in one tested place is the point of this module.
 */
import { describe, it, expect, vi } from 'vitest';
import { runChapterGeneration } from './chapter-generation.js';

const chapter = { title: 'Ch1', markdown: '# One', translatedMarkdown: null };

/** A coordinator wired to spies, with every collaborator succeeding. */
function harness(overrides = {}) {
  const calls = [];
  const deps = {
    chapter,
    audioMode: 'original',
    voice: { voiceEn: 'en-X', voiceZh: 'zh-X', speechRateEn: 0, speechRateZh: 0 },
    checkpoint: null,
    generate: vi.fn(async () => {
      calls.push('generate');
      return { blob: new Blob(['mp3']), timeline: ['t'] };
    }),
    commit: vi.fn(() => { calls.push('commit'); }),
    persist: vi.fn(async () => { calls.push('persist'); return true; }),
    clearCheckpoint: vi.fn(async () => { calls.push('clearCheckpoint'); }),
    ...overrides,
  };
  return { deps, calls, run: () => runChapterGeneration(deps) };
}

describe('runChapterGeneration', () => {
  it('commits, persists, then clears the checkpoint — in that order', async () => {
    const { run, calls } = harness();

    const result = await run();

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['generate', 'commit', 'persist', 'clearCheckpoint']);
  });

  // The durability promise: at every instant either a resumable checkpoint or a
  // finished MP3 exists. Clearing before a confirmed save destroyed both.
  it('keeps the checkpoint when the finished audio fails to persist', async () => {
    const { deps, run } = harness({ persist: vi.fn(async () => false) });

    const result = await run();

    expect(result.ok).toBe(false);
    expect(result.persistFailed).toBe(true);
    expect(deps.clearCheckpoint).not.toHaveBeenCalled();
  });

  it('keeps the checkpoint and reports the error when synthesis fails', async () => {
    const boom = new Error('socket closed');
    const { deps, run } = harness({ generate: vi.fn(async () => { throw boom; }) });

    const result = await run();

    expect(result.ok).toBe(false);
    expect(result.error).toBe(boom);
    expect(result.cancelled).toBe(false);
    expect(deps.commit).not.toHaveBeenCalled();
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.clearCheckpoint).not.toHaveBeenCalled();
  });

  // A user-initiated cancel is not an error to shout about.
  it('reports a cancellation distinctly from a failure', async () => {
    const { run } = harness({
      generate: vi.fn(async () => { throw new Error('Audio generation cancelled'); }),
    });

    const result = await run();

    expect(result.ok).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it('passes the chapter, mode, voices and stored checkpoint to the generator', async () => {
    const checkpoint = { completedIndex: 40, totalSegments: 100, audioMode: 'original', audioBlobs: [] };
    const { deps, run } = harness({ checkpoint });

    await run();

    const args = deps.generate.mock.calls[0][0];
    expect(args.originalText).toBe('# One');
    expect(args.audioMode).toBe('original');
    expect(args.voiceEn).toBe('en-X');
    expect(args.speechRateZh).toBe(0);
    expect(args.checkpoint).toBe(checkpoint);
  });

  it('hands the generated blob and timeline to commit', async () => {
    const blob = new Blob(['mp3']);
    const { deps, run } = harness({
      generate: vi.fn(async () => ({ blob, timeline: ['a', 'b'] })),
    });

    await run();

    expect(deps.commit).toHaveBeenCalledWith(blob, ['a', 'b']);
  });

  it('forwards progress, status, resume and checkpoint callbacks to the generator', async () => {
    const onProgress = vi.fn();
    const onStatus = vi.fn();
    const onResume = vi.fn();
    const onCheckpoint = vi.fn();
    const { deps, run } = harness({
      onProgress, onStatus, onResume, onCheckpoint,
      generate: vi.fn(async (opts) => {
        opts.onResume({ resuming: true, startIndex: 40, totalSegments: 100 });
        opts.onStatus('翻译中');
        opts.onProgress(41, 100);
        await opts.onCheckpoint({ completedIndex: 41 });
        return { blob: new Blob(['mp3']), timeline: null };
      }),
    });

    await run();

    expect(onResume).toHaveBeenCalledWith({ resuming: true, startIndex: 40, totalSegments: 100 });
    expect(onStatus).toHaveBeenCalledWith('翻译中');
    expect(onProgress).toHaveBeenCalledWith(41, 100);
    expect(onCheckpoint).toHaveBeenCalledWith({ completedIndex: 41 });
    expect(deps.commit).toHaveBeenCalled();
  });

  // Callbacks are optional; a caller that wants none must not crash the run.
  it('runs with no callbacks supplied', async () => {
    const { run } = harness({
      generate: vi.fn(async (opts) => {
        opts.onResume({ resuming: false });
        opts.onStatus('x');
        opts.onProgress(1, 1);
        await opts.onCheckpoint({ completedIndex: 1 });
        return { blob: new Blob(['mp3']), timeline: null };
      }),
    });

    await expect(run()).resolves.toMatchObject({ ok: true });
  });
});
