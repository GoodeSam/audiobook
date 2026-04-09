import { describe, it, expect, vi } from 'vitest';
import { ProgressTracker } from './progress-tracker.js';

describe('ProgressTracker', () => {
  it('creates with multiple phases and weights', () => {
    const tracker = new ProgressTracker([
      { name: 'translating', weight: 0.3 },
      { name: 'generating', weight: 0.7 },
    ]);

    expect(tracker.overallPercent).toBe(0);
    expect(tracker.currentPhase).toBe(null);
  });

  it('starts a phase and tracks progress', () => {
    const tracker = new ProgressTracker([
      { name: 'translating', weight: 1.0 },
    ]);

    tracker.startPhase('translating', 10);
    expect(tracker.currentPhase).toBe('translating');

    tracker.advance(5);
    expect(tracker.overallPercent).toBe(50);
  });

  it('tracks progress across multiple phases with weights', () => {
    const tracker = new ProgressTracker([
      { name: 'translating', weight: 0.3 },
      { name: 'generating', weight: 0.7 },
    ]);

    // Complete translation phase
    tracker.startPhase('translating', 10);
    tracker.advance(10);
    expect(tracker.overallPercent).toBe(30); // 0.3 * 100%

    // Halfway through generation
    tracker.startPhase('generating', 20);
    tracker.advance(10);
    expect(tracker.overallPercent).toBe(65); // 30 + 0.7 * 50%
  });

  it('calls onProgress callback with status object', () => {
    const tracker = new ProgressTracker([
      { name: 'translating', weight: 1.0 },
    ]);

    const calls = [];
    tracker.onProgress((status) => calls.push({ ...status }));

    tracker.startPhase('translating', 4);
    tracker.advance(2);

    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({
      phase: 'translating',
      current: 2,
      total: 4,
      overallPercent: 50,
    });
  });

  it('fires callback on each advance', () => {
    const tracker = new ProgressTracker([
      { name: 'work', weight: 1.0 },
    ]);

    const calls = [];
    tracker.onProgress((s) => calls.push(s.current));

    tracker.startPhase('work', 3);
    tracker.advance(1);
    tracker.advance(2);
    tracker.advance(3);

    expect(calls).toEqual([1, 2, 3]);
  });

  it('tracks cancellation state', () => {
    const tracker = new ProgressTracker([
      { name: 'work', weight: 1.0 },
    ]);

    expect(tracker.cancelled).toBe(false);
    tracker.cancel();
    expect(tracker.cancelled).toBe(true);
  });

  it('handles single phase with weight normalization', () => {
    const tracker = new ProgressTracker([
      { name: 'only', weight: 5 }, // Non-normalized weight
    ]);

    tracker.startPhase('only', 10);
    tracker.advance(10);
    expect(tracker.overallPercent).toBe(100);
  });

  it('provides descriptive status text', () => {
    const tracker = new ProgressTracker([
      { name: 'translating', weight: 0.3 },
      { name: 'generating', weight: 0.7 },
    ]);

    tracker.startPhase('translating', 5);
    tracker.advance(3);

    expect(tracker.statusText).toBe('Translating: 3 / 5');
  });

  it('generates correct status text for generating phase', () => {
    const tracker = new ProgressTracker([
      { name: 'generating', weight: 1.0 },
    ]);

    tracker.startPhase('generating', 20);
    tracker.advance(15);

    expect(tracker.statusText).toBe('Generating: 15 / 20');
  });

  it('resets properly', () => {
    const tracker = new ProgressTracker([
      { name: 'work', weight: 1.0 },
    ]);

    tracker.startPhase('work', 10);
    tracker.advance(10);
    expect(tracker.overallPercent).toBe(100);

    tracker.reset();
    expect(tracker.overallPercent).toBe(0);
    expect(tracker.currentPhase).toBe(null);
    expect(tracker.cancelled).toBe(false);
  });
});
