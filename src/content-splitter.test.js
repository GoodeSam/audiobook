import { describe, it, expect } from 'vitest';
import { splitIntoParts, calculateVariance } from './content-splitter.js';

describe('calculateVariance', () => {
  it('returns 0 for equal-sized parts', () => {
    expect(calculateVariance([100, 100, 100])).toBe(0);
  });

  it('calculates variance as (max - min) / average', () => {
    // avg = 100, max = 110, min = 90 → (110-90)/100 = 0.2
    expect(calculateVariance([90, 100, 110])).toBeCloseTo(0.2);
  });

  it('returns 0 for single part', () => {
    expect(calculateVariance([500])).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(calculateVariance([])).toBe(0);
  });
});

describe('splitIntoParts', () => {
  // Helper to create chapters with paragraphs of known sizes
  function makeChapters(structure) {
    // structure: [[paraSize, paraSize, ...], [...], ...]
    return structure.map((paraSizes, i) => ({
      title: `Chapter ${i + 1}`,
      markdown: paraSizes.map((size, j) => 'x'.repeat(size)).join('\n\n'),
    }));
  }

  function getPartSizes(parts) {
    return parts.map(p => p.paragraphs.reduce((sum, para) => sum + para.length, 0));
  }

  describe('with 10+ chapters', () => {
    it('produces at least 10 parts', () => {
      const chapters = makeChapters(Array(12).fill([100]));
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBeGreaterThanOrEqual(10);
    });

    it('uses chapter boundaries when chapters are balanced', () => {
      const chapters = makeChapters(Array(10).fill([100]));
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBe(10);
      // Each part should correspond to one chapter
      parts.forEach((part, i) => {
        expect(part.chapterIndices).toContain(i);
      });
    });

    it('rebalances when chapter sizes are uneven', () => {
      // 12 chapters with many small paragraphs — uneven chapter sizes
      // but enough granularity for balancing
      const structure = [
        ...Array(6).fill(Array(5).fill(20)),   // 6 chapters × 100 chars
        ...Array(6).fill(Array(10).fill(20)),  // 6 chapters × 200 chars
      ];
      const chapters = makeChapters(structure);
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBeGreaterThanOrEqual(10);
      const sizes = getPartSizes(parts);
      const variance = calculateVariance(sizes);
      expect(variance).toBeLessThanOrEqual(0.10);
    });
  });

  describe('with fewer than 10 chapters', () => {
    it('splits paragraphs to produce at least 10 parts', () => {
      // 3 chapters with many paragraphs each
      const chapters = makeChapters([
        Array(20).fill(50),  // 1000 chars
        Array(20).fill(50),  // 1000 chars
        Array(20).fill(50),  // 1000 chars
      ]);
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBeGreaterThanOrEqual(10);
    });

    it('never splits mid-paragraph', () => {
      const chapters = makeChapters([Array(30).fill(100)]);
      const parts = splitIntoParts(chapters);
      // Each paragraph should appear intact in exactly one part
      const allParas = chapters[0].markdown.split('\n\n');
      for (const part of parts) {
        for (const para of part.paragraphs) {
          expect(allParas).toContain(para);
        }
      }
    });

    it('keeps variance under 10%', () => {
      const chapters = makeChapters([
        Array(50).fill(100),  // 5000 chars
        Array(50).fill(100),  // 5000 chars
      ]);
      const parts = splitIntoParts(chapters);
      const sizes = getPartSizes(parts);
      const variance = calculateVariance(sizes);
      expect(variance).toBeLessThanOrEqual(0.10);
    });

    it('handles single chapter with many paragraphs', () => {
      const chapters = makeChapters([Array(100).fill(50)]);
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBeGreaterThanOrEqual(10);
      const sizes = getPartSizes(parts);
      const variance = calculateVariance(sizes);
      expect(variance).toBeLessThanOrEqual(0.10);
    });
  });

  describe('part structure', () => {
    it('each part has title, paragraphs, and chapterIndices', () => {
      const chapters = makeChapters([Array(20).fill(50)]);
      const parts = splitIntoParts(chapters);
      for (const part of parts) {
        expect(part).toHaveProperty('title');
        expect(part).toHaveProperty('paragraphs');
        expect(part).toHaveProperty('chapterIndices');
        expect(Array.isArray(part.paragraphs)).toBe(true);
        expect(Array.isArray(part.chapterIndices)).toBe(true);
        expect(part.paragraphs.length).toBeGreaterThan(0);
      }
    });

    it('parts have sequential numbering in title', () => {
      const chapters = makeChapters([Array(20).fill(50)]);
      const parts = splitIntoParts(chapters);
      parts.forEach((part, i) => {
        expect(part.title).toContain(String(i + 1));
      });
    });

    it('all paragraphs are accounted for (no loss)', () => {
      const chapters = makeChapters([
        Array(15).fill(80),
        Array(15).fill(80),
      ]);
      const parts = splitIntoParts(chapters);
      const totalParasIn = 30;
      const totalParasOut = parts.reduce((sum, p) => sum + p.paragraphs.length, 0);
      expect(totalParasOut).toBe(totalParasIn);
    });

    it('preserves paragraph order', () => {
      const paras = Array.from({ length: 30 }, (_, i) => `para_${i}`);
      const chapters = [{
        title: 'Ch1',
        markdown: paras.join('\n\n'),
      }];
      const parts = splitIntoParts(chapters);
      const reconstructed = parts.flatMap(p => p.paragraphs);
      expect(reconstructed).toEqual(paras);
    });
  });

  describe('edge cases', () => {
    it('handles empty chapters', () => {
      const chapters = [{ title: 'Empty', markdown: '' }];
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBeGreaterThanOrEqual(1);
    });

    it('handles chapters with single paragraph', () => {
      const chapters = makeChapters(Array(5).fill([500]));
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBeGreaterThanOrEqual(5);
    });

    it('handles very uneven paragraph sizes', () => {
      // Mix of tiny and huge paragraphs
      const chapters = makeChapters([[10, 500, 10, 500, 10, 500, 10, 500, 10, 500, 10, 500]]);
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBeGreaterThanOrEqual(1);
      // No mid-paragraph splits
      for (const part of parts) {
        for (const para of part.paragraphs) {
          expect(para.length === 10 || para.length === 500).toBe(true);
        }
      }
    });

    it('returns minimum viable parts when not enough content for 10', () => {
      // Only 3 paragraphs total — can't make 10 parts
      const chapters = makeChapters([[100, 100, 100]]);
      const parts = splitIntoParts(chapters);
      expect(parts.length).toBe(3);
    });

    it('custom minParts parameter', () => {
      const chapters = makeChapters([Array(30).fill(50)]);
      const parts = splitIntoParts(chapters, { minParts: 15 });
      expect(parts.length).toBeGreaterThanOrEqual(15);
    });
  });
});
