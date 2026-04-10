import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTranslationCheckpoint,
  createAudioCheckpoint,
  mergeTranslationResult,
  isTranslationComplete,
  isAudioComplete,
} from './checkpoint.js';

describe('createTranslationCheckpoint', () => {
  it('creates a checkpoint with completed paragraphs', () => {
    const cp = createTranslationCheckpoint(5, ['para1', 'para2', 'para3']);
    expect(cp.completedIndex).toBe(3);
    expect(cp.totalParagraphs).toBe(5);
    expect(cp.translatedParagraphs).toEqual(['para1', 'para2', 'para3']);
  });

  it('creates empty checkpoint', () => {
    const cp = createTranslationCheckpoint(10, []);
    expect(cp.completedIndex).toBe(0);
    expect(cp.totalParagraphs).toBe(10);
    expect(cp.translatedParagraphs).toEqual([]);
  });
});

describe('createAudioCheckpoint', () => {
  it('creates a checkpoint with completed segment blobs', () => {
    const blobs = [new Blob(['a']), new Blob(['b'])];
    const cp = createAudioCheckpoint(5, blobs);
    expect(cp.completedIndex).toBe(2);
    expect(cp.totalSegments).toBe(5);
    expect(cp.audioBlobs).toEqual(blobs);
  });

  it('creates empty checkpoint', () => {
    const cp = createAudioCheckpoint(8, []);
    expect(cp.completedIndex).toBe(0);
    expect(cp.totalSegments).toBe(8);
    expect(cp.audioBlobs).toEqual([]);
  });
});

describe('mergeTranslationResult', () => {
  it('merges checkpoint paragraphs with new paragraphs', () => {
    const checkpoint = createTranslationCheckpoint(5, ['translated1', 'translated2']);
    const newParagraphs = ['translated3', 'translated4', 'translated5'];
    const result = mergeTranslationResult(checkpoint, newParagraphs);
    expect(result).toEqual([
      'translated1', 'translated2',
      'translated3', 'translated4', 'translated5',
    ]);
  });

  it('works with empty checkpoint', () => {
    const checkpoint = createTranslationCheckpoint(3, []);
    const newParagraphs = ['a', 'b', 'c'];
    expect(mergeTranslationResult(checkpoint, newParagraphs)).toEqual(['a', 'b', 'c']);
  });

  it('works with full checkpoint (no new paragraphs)', () => {
    const checkpoint = createTranslationCheckpoint(2, ['a', 'b']);
    expect(mergeTranslationResult(checkpoint, [])).toEqual(['a', 'b']);
  });
});

describe('isTranslationComplete', () => {
  it('returns true when all paragraphs are translated', () => {
    const cp = createTranslationCheckpoint(3, ['a', 'b', 'c']);
    expect(isTranslationComplete(cp)).toBe(true);
  });

  it('returns false when some paragraphs remain', () => {
    const cp = createTranslationCheckpoint(5, ['a', 'b']);
    expect(isTranslationComplete(cp)).toBe(false);
  });

  it('returns true for empty total', () => {
    const cp = createTranslationCheckpoint(0, []);
    expect(isTranslationComplete(cp)).toBe(true);
  });
});

describe('isAudioComplete', () => {
  it('returns true when all segments are synthesized', () => {
    const blobs = [new Blob(['a']), new Blob(['b'])];
    const cp = createAudioCheckpoint(2, blobs);
    expect(isAudioComplete(cp)).toBe(true);
  });

  it('returns false when segments remain', () => {
    const cp = createAudioCheckpoint(5, [new Blob(['a'])]);
    expect(isAudioComplete(cp)).toBe(false);
  });
});
