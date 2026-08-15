/**
 * Tests for audio checkpoint persistence policy.
 *
 * Three separate defects this module exists to prevent:
 *
 * 1. Checkpoints lived only in the JS heap, so a reload / tab discard / going
 *    back to the shelf destroyed every synthesized segment.
 * 2. Checkpoints were keyed by chapter index alone. Interrupting in one audio
 *    mode and restarting in another spliced blobs from two different segment
 *    lists together and silently killed subtitle sync.
 * 3. A checkpoint could claim completedIndex=N while holding zero blobs (the
 *    array-aliasing bug), which made a resume drop the first N segments.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shouldFlushCheckpoint,
  isResumable,
  resumePlan,
  createSegmentPersister,
} from './audio-checkpoint-store.js';

const blobs = (n) => Array.from({ length: n }, (_, i) => new Blob([`b${i}`]));

/** A well-formed checkpoint for `n` completed segments out of `total`. */
const cp = (n, total, audioMode = 'original') => ({
  completedIndex: n,
  totalSegments: total,
  audioMode,
  audioBlobs: blobs(n),
});

describe('shouldFlushCheckpoint', () => {
  it('flushes once every N segments', () => {
    expect(shouldFlushCheckpoint({ completedIndex: 20, totalSegments: 100, lastFlushed: 0, flushEvery: 20 })).toBe(true);
    expect(shouldFlushCheckpoint({ completedIndex: 19, totalSegments: 100, lastFlushed: 0, flushEvery: 20 })).toBe(false);
  });

  it('does not re-flush the same point twice', () => {
    expect(shouldFlushCheckpoint({ completedIndex: 20, totalSegments: 100, lastFlushed: 20, flushEvery: 20 })).toBe(false);
  });

  it('always flushes the final segment even if it is not on the interval', () => {
    expect(shouldFlushCheckpoint({ completedIndex: 100, totalSegments: 100, lastFlushed: 80, flushEvery: 20 })).toBe(true);
    expect(shouldFlushCheckpoint({ completedIndex: 93, totalSegments: 93, lastFlushed: 80, flushEvery: 20 })).toBe(true);
  });

  it('flushes when the interval was overshot, not only on exact multiples', () => {
    // A resume starting at 25 reaches 45 without ever hitting a multiple of 20.
    expect(shouldFlushCheckpoint({ completedIndex: 45, totalSegments: 100, lastFlushed: 25, flushEvery: 20 })).toBe(true);
  });

  it('never flushes at zero progress', () => {
    expect(shouldFlushCheckpoint({ completedIndex: 0, totalSegments: 100, lastFlushed: 0, flushEvery: 20 })).toBe(false);
  });
});

describe('isResumable', () => {
  it('accepts a well-formed checkpoint for the same mode and length', () => {
    expect(isResumable(cp(50, 100), { audioMode: 'original', totalSegments: 100 })).toBe(true);
  });

  it('rejects a missing checkpoint', () => {
    expect(isResumable(null, { audioMode: 'original', totalSegments: 100 })).toBe(false);
    expect(isResumable(undefined, { audioMode: 'original', totalSegments: 100 })).toBe(false);
  });

  it('rejects a checkpoint from a different audio mode', () => {
    expect(isResumable(cp(50, 100, 'bilingual'), { audioMode: 'original', totalSegments: 100 })).toBe(false);
  });

  it('rejects a checkpoint whose segment count no longer matches', () => {
    // Chapter text or translation changed — old blobs no longer line up.
    expect(isResumable(cp(50, 100), { audioMode: 'original', totalSegments: 120 })).toBe(false);
  });

  it('rejects a checkpoint whose blob count disagrees with completedIndex', () => {
    const corrupt = { completedIndex: 50, totalSegments: 100, audioMode: 'original', audioBlobs: [] };
    expect(isResumable(corrupt, { audioMode: 'original', totalSegments: 100 })).toBe(false);
  });

  it('rejects zero or negative progress', () => {
    expect(isResumable(cp(0, 100), { audioMode: 'original', totalSegments: 100 })).toBe(false);
  });

  it('rejects progress beyond the total', () => {
    const over = { completedIndex: 120, totalSegments: 100, audioMode: 'original', audioBlobs: blobs(120) };
    expect(isResumable(over, { audioMode: 'original', totalSegments: 100 })).toBe(false);
  });

  it('treats a checkpoint with no recorded mode as unusable rather than guessing', () => {
    const legacy = { completedIndex: 50, totalSegments: 100, audioBlobs: blobs(50) };
    expect(isResumable(legacy, { audioMode: 'original', totalSegments: 100 })).toBe(false);
  });
});

describe('resumePlan', () => {
  it('returns the resume point for a valid checkpoint', () => {
    const plan = resumePlan(cp(50, 100), { audioMode: 'original', totalSegments: 100 });
    expect(plan.resuming).toBe(true);
    expect(plan.startIndex).toBe(50);
    expect(plan.existingBlobs.length).toBe(50);
  });

  it('falls back to a clean start for an unusable checkpoint', () => {
    const plan = resumePlan(cp(50, 100, 'bilingual'), { audioMode: 'original', totalSegments: 100 });
    expect(plan.resuming).toBe(false);
    expect(plan.startIndex).toBe(0);
    expect(plan.existingBlobs).toEqual([]);
  });

  it('falls back to a clean start when there is no checkpoint', () => {
    const plan = resumePlan(null, { audioMode: 'original', totalSegments: 100 });
    expect(plan).toEqual({ resuming: false, startIndex: 0, existingBlobs: [] });
  });

  it('hands out a copy so the caller cannot mutate the stored checkpoint', () => {
    const stored = cp(3, 10);
    const plan = resumePlan(stored, { audioMode: 'original', totalSegments: 10 });
    plan.existingBlobs.push(new Blob(['x']));
    expect(stored.audioBlobs.length).toBe(3);
  });
});

describe('createSegmentPersister', () => {
  it('writes to storage only on the flush interval', async () => {
    const save = vi.fn(async () => {});
    const persister = createSegmentPersister({ save, remove: vi.fn(), flushEvery: 5 });

    for (let i = 1; i <= 12; i++) {
      await persister.record(cp(i, 100));
    }

    expect(save).toHaveBeenCalledTimes(2); // at 5 and 10
  });

  it('flushes the final segment regardless of the interval', async () => {
    const save = vi.fn(async () => {});
    const persister = createSegmentPersister({ save, remove: vi.fn(), flushEvery: 5 });

    for (let i = 1; i <= 12; i++) {
      await persister.record(cp(i, 12));
    }

    expect(save).toHaveBeenCalledTimes(3); // 5, 10, 12
  });

  it('passes the checkpoint through to save unchanged', async () => {
    const save = vi.fn(async () => {});
    const persister = createSegmentPersister({ save, remove: vi.fn(), flushEvery: 2 });

    const checkpoint = cp(2, 10, 'bilingual');
    await persister.record(checkpoint);

    expect(save).toHaveBeenCalledWith(checkpoint);
  });

  it('swallows storage failures so generation is never aborted by a full disk', async () => {
    const save = vi.fn(async () => { throw new Error('QuotaExceededError'); });
    const onError = vi.fn();
    const persister = createSegmentPersister({ save, remove: vi.fn(), flushEvery: 1, onError });

    await expect(persister.record(cp(1, 10))).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });

  it('stops retrying storage after repeated failures', async () => {
    const save = vi.fn(async () => { throw new Error('QuotaExceededError'); });
    const persister = createSegmentPersister({ save, remove: vi.fn(), flushEvery: 1, maxFailures: 3 });

    for (let i = 1; i <= 20; i++) await persister.record(cp(i, 100));

    expect(save).toHaveBeenCalledTimes(3);
  });

  it('removes the stored checkpoint once the chapter completes', async () => {
    const remove = vi.fn(async () => {});
    const persister = createSegmentPersister({ save: vi.fn(), remove, flushEvery: 5 });

    await persister.done();

    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('reports whether anything was ever persisted', async () => {
    const persister = createSegmentPersister({ save: vi.fn(async () => {}), remove: vi.fn(), flushEvery: 5 });
    expect(persister.persistedAny()).toBe(false);
    await persister.record(cp(5, 100));
    expect(persister.persistedAny()).toBe(true);
  });
});
