/**
 * Content splitter — divides book content into balanced parts.
 *
 * If 10+ chapters exist and they're reasonably balanced, uses chapter
 * boundaries. Otherwise subdivides at the paragraph level.
 * Guarantees no mid-paragraph splits. Targets ≤10% size variance when
 * paragraph granularity allows it, but cannot guarantee it when individual
 * paragraphs have extreme size differences.
 *
 * Sizes are measured in narratable characters, not raw markdown length —
 * an embedded image (`![alt](data:...base64...)`) can be tens of KB of
 * text but contributes nothing to translation or narration time, so it
 * must not be allowed to dominate the balance.
 *
 * Each part can be independently translated and converted to audio.
 */

import { isSkipParagraph } from './paragraph-utils.js';

const DEFAULT_MIN_PARTS = 10;
const MAX_VARIANCE = 0.10;

/** Size a paragraph contributes to balancing — images/rules count as 0. */
function narratableLength(text) {
  return isSkipParagraph(text) ? 0 : text.length;
}

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
      allParas.push({ text: p, chapterIndex: ci, size: narratableLength(p) });
    }
  }

  if (allParas.length === 0) {
    return [{ title: 'Part 1', paragraphs: [], chapterIndices: [0] }];
  }

  // Try chapter-based splitting first if enough chapters
  if (chapters.length >= minParts) {
    const chapterParts = buildChapterParts(chapters, allParas);
    // buildChapterParts drops empty chapters, so it can produce fewer than
    // minParts even when `chapters.length >= minParts` — don't accept that.
    if (chapterParts.length >= minParts) {
      const chapterSizes = chapterParts.map(p => p.paragraphs.reduce((s, t) => s + narratableLength(t), 0));
      if (calculateVariance(chapterSizes) <= MAX_VARIANCE) {
        return chapterParts;
      }
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

/**
 * Auto-split overly long chapters into balanced parts at paragraph
 * boundaries — for books whose source has no usable chapter structure
 * (e.g. a whole book parsed as one chapter). Chapters at or under
 * triggerChars pass through unchanged; split parts are titled
 * "Title (i/n)" and lose any stale translation.
 */
export function autoSplitChapters(chapters, options = {}) {
  const trigger = options.triggerChars || 9000;
  const target = options.targetChars || 6000;
  const out = [];
  let changed = false;
  for (const ch of chapters) {
    const paras = (ch.markdown || '').split(/\n\n+/).filter(p => p.trim());
    const len = paras.reduce((s, p) => s + narratableLength(p), 0);
    if (len <= trigger) {
      out.push(ch);
      continue;
    }
    const nParts = Math.max(2, Math.round(len / target));
    const parts = splitIntoParts([ch], { minParts: nParts });
    if (parts.length <= 1) {
      out.push(ch);
      continue;
    }
    changed = true;
    parts.forEach((p, i) => out.push({
      ...ch,
      title: `${ch.title} (${i + 1}/${parts.length})`,
      markdown: p.paragraphs.join('\n\n'),
      translatedMarkdown: null,
    }));
  }
  return changed ? out : chapters;
}
