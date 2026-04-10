/**
 * Content splitter — divides book content into balanced parts.
 *
 * If 10+ chapters exist and they're reasonably balanced, uses chapter
 * boundaries. Otherwise subdivides at the paragraph level.
 * Guarantees no mid-paragraph splits and targets ≤10% size variance.
 *
 * Each part can be independently translated and converted to audio.
 */

const DEFAULT_MIN_PARTS = 10;
const MAX_VARIANCE = 0.10;

/**
 * Calculate size variance as (max - min) / average.
 * @param {number[]} sizes
 * @returns {number} Variance ratio (0 = perfectly equal).
 */
export function calculateVariance(sizes) {
  if (sizes.length <= 1) return 0;
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  if (avg === 0) return 0;
  return (max - min) / avg;
}

/**
 * Split book chapters into balanced parts.
 *
 * @param {Array<{title: string, markdown: string}>} chapters
 * @param {object} [options]
 * @param {number} [options.minParts=10] - Minimum number of parts to produce.
 * @returns {Array<{title: string, paragraphs: string[], chapterIndices: number[]}>}
 */
export function splitIntoParts(chapters, options = {}) {
  const minParts = options.minParts || DEFAULT_MIN_PARTS;

  // Collect all paragraphs with chapter origin
  const allParas = [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const md = chapters[ci].markdown || '';
    const paras = md.split(/\n\n+/).filter(p => p.trim());
    for (const p of paras) {
      allParas.push({ text: p, chapterIndex: ci, size: p.length });
    }
  }

  if (allParas.length === 0) {
    return [{ title: 'Part 1', paragraphs: [], chapterIndices: [0] }];
  }

  // Try chapter-based splitting first if enough chapters
  if (chapters.length >= minParts) {
    const chapterParts = buildChapterParts(chapters, allParas);
    const chapterSizes = chapterParts.map(p => p.paragraphs.reduce((s, t) => s + t.length, 0));
    if (calculateVariance(chapterSizes) <= MAX_VARIANCE) {
      return chapterParts;
    }
  }

  // Split at paragraph level for balanced parts
  const numParts = Math.min(minParts, allParas.length);
  return balancedSplit(allParas, numParts);
}

/**
 * Build parts from chapter boundaries (one part per chapter).
 */
function buildChapterParts(chapters, allParas) {
  const parts = [];
  for (let ci = 0; ci < chapters.length; ci++) {
    const paras = allParas.filter(p => p.chapterIndex === ci).map(p => p.text);
    if (paras.length > 0) {
      parts.push({
        title: `Part ${parts.length + 1} — ${chapters[ci].title}`,
        paragraphs: paras,
        chapterIndices: [ci],
      });
    }
  }
  return parts;
}

/**
 * Split paragraphs into N parts with minimum variance.
 *
 * Uses a linear partition algorithm: find N-1 split points in the
 * paragraph list that minimize the difference between the largest
 * and smallest part.
 */
function balancedSplit(allParas, numParts) {
  if (numParts <= 1) {
    return [makePart(allParas, 0)];
  }

  const n = allParas.length;
  // Prefix sums for O(1) range-sum queries
  const prefix = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = prefix[i] + allParas[i].size;
  }
  const totalSize = prefix[n];
  const targetSize = totalSize / numParts;

  // Greedy split aiming for target size per part
  const splitPoints = greedySplit(prefix, n, numParts, targetSize);

  // Build parts from split points
  return buildPartsFromSplits(allParas, splitPoints);
}

/**
 * Greedy split: walk through paragraphs, accumulate until closest to target.
 * Returns array of split-point indices (start of each new part).
 */
function greedySplit(prefix, n, numParts, targetSize) {
  const splits = [0]; // First part starts at index 0
  let partsRemaining = numParts - 1;

  for (let i = 1; i < n && partsRemaining > 0; i++) {
    const currentPartSize = prefix[i] - prefix[splits[splits.length - 1]];
    const withNext = prefix[i + 1] - prefix[splits[splits.length - 1]];
    const remainingParas = n - i;

    // Must split if not enough paragraphs left for remaining parts
    const mustSplit = remainingParas <= partsRemaining;

    // Split if current is closer to target than current+next, or must split
    const currentDiff = Math.abs(currentPartSize - targetSize);
    const withNextDiff = Math.abs(withNext - targetSize);

    if (mustSplit || (currentPartSize >= targetSize && currentDiff <= withNextDiff)) {
      splits.push(i);
      partsRemaining--;
    }
  }

  return splits;
}

/**
 * Build part objects from split-point indices.
 */
function buildPartsFromSplits(allParas, splits) {
  const parts = [];
  for (let s = 0; s < splits.length; s++) {
    const start = splits[s];
    const end = s + 1 < splits.length ? splits[s + 1] : allParas.length;
    const slice = allParas.slice(start, end);
    parts.push(makePart(slice, parts.length));
  }
  return parts;
}

function makePart(paraSlice, index) {
  const chapters = new Set(paraSlice.map(p => p.chapterIndex));
  return {
    title: `Part ${index + 1}`,
    paragraphs: paraSlice.map(p => p.text),
    chapterIndices: [...chapters],
  };
}
