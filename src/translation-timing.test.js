/**
 * Where does a slow translation actually spend its time?
 *
 * Reported symptom: the sentence counter advances steadily, with no rate-limit
 * message — so the cost is spread evenly rather than spent in a few long
 * stalls. Three candidates produce that shape and need completely different
 * fixes:
 *
 *   pacing     — the fixed 350ms sleep between batches (ours; tunable)
 *   network    — round trip to the translation API (not ours; latency-bound)
 *   rateLimit  — 429 backoff (ours to avoid, but reportedly not firing)
 *
 * Guessing between them means optimizing the wrong one. This records them
 * separately and names the biggest.
 */
import { describe, it, expect } from 'vitest';
import { createTimingRecorder } from './translation-timing.js';

describe('createTimingRecorder', () => {
  it('starts empty', () => {
    const s = createTimingRecorder().summary();
    expect(s.batches).toBe(0);
    expect(s.sentences).toBe(0);
    expect(s.totalMs).toBe(0);
    expect(s.dominant).toBe(null);
  });

  it('totals each bucket separately across batches', () => {
    const r = createTimingRecorder();
    r.recordBatch({ size: 25, networkMs: 800, pacingMs: 350, rateLimitMs: 0 });
    r.recordBatch({ size: 25, networkMs: 900, pacingMs: 350, rateLimitMs: 0 });
    r.recordBatch({ size: 10, networkMs: 700, pacingMs: 350, rateLimitMs: 5000 });

    const s = r.summary();
    expect(s.batches).toBe(3);
    expect(s.sentences).toBe(60);
    expect(s.networkMs).toBe(2400);
    expect(s.pacingMs).toBe(1050);
    expect(s.rateLimitMs).toBe(5000);
    expect(s.totalMs).toBe(8450);
  });

  it('names the bucket that dominates', () => {
    const network = createTimingRecorder();
    network.recordBatch({ size: 25, networkMs: 2000, pacingMs: 350, rateLimitMs: 0 });
    expect(network.summary().dominant).toBe('network');

    const pacing = createTimingRecorder();
    pacing.recordBatch({ size: 25, networkMs: 100, pacingMs: 350, rateLimitMs: 0 });
    expect(pacing.summary().dominant).toBe('pacing');

    const limited = createTimingRecorder();
    limited.recordBatch({ size: 25, networkMs: 800, pacingMs: 350, rateLimitMs: 30000 });
    expect(limited.summary().dominant).toBe('rateLimit');
  });

  it('reports average network time per batch and per sentence', () => {
    const r = createTimingRecorder();
    r.recordBatch({ size: 25, networkMs: 1000, pacingMs: 0, rateLimitMs: 0 });
    r.recordBatch({ size: 25, networkMs: 2000, pacingMs: 500, rateLimitMs: 0 });

    const s = r.summary();
    expect(s.avgNetworkMs).toBe(1500);
    expect(s.msPerSentence).toBe(70); // 3500ms over 50 sentences
  });

  // A run that is mostly cache hits should say so — otherwise a fast second run
  // looks like the pacing fix worked when nothing was actually translated.
  it('records cache hits and misses', () => {
    const r = createTimingRecorder();
    r.recordCache({ hits: 900, misses: 100 });
    r.recordCache({ hits: 50, misses: 0 });

    const s = r.summary();
    expect(s.cacheHits).toBe(950);
    expect(s.cacheMisses).toBe(100);
    expect(s.cacheHitRate).toBeCloseTo(950 / 1050, 5);
  });

  it('treats missing buckets as zero rather than NaN', () => {
    const r = createTimingRecorder();
    r.recordBatch({ size: 25, networkMs: 500 });

    const s = r.summary();
    expect(s.pacingMs).toBe(0);
    expect(s.rateLimitMs).toBe(0);
    expect(s.totalMs).toBe(500);
  });

  it('renders a one-line summary a human can read', () => {
    const r = createTimingRecorder();
    r.recordCache({ hits: 0, misses: 50 });
    r.recordBatch({ size: 25, networkMs: 2000, pacingMs: 350, rateLimitMs: 0 });
    r.recordBatch({ size: 25, networkMs: 2000, pacingMs: 350, rateLimitMs: 0 });

    const line = r.describe();
    expect(line).toContain('2 批');
    expect(line).toContain('50 句');
    expect(line).toContain('网络');
  });
});
