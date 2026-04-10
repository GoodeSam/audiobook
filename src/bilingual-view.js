/**
 * Bilingual view builder.
 *
 * Creates a paragraph-by-paragraph interleaved view of original and
 * translated text for side-by-side reading.
 */

import { splitParagraphs, isHeading } from './paragraph-utils.js';

/**
 * Build bilingual markdown with original and translated paragraphs interleaved.
 *
 * @param {string} original - Original chapter markdown.
 * @param {string} translated - Translated chapter markdown.
 * @returns {string} Interleaved markdown.
 */
export function buildBilingualMarkdown(original, translated) {
  const origParas = splitParagraphs(original);
  const transParas = splitParagraphs(translated);

  if (origParas.length === 0 && transParas.length === 0) return '';

  const maxLen = Math.max(origParas.length, transParas.length);
  const lines = [];

  for (let i = 0; i < maxLen; i++) {
    const orig = i < origParas.length ? origParas[i] : null;
    const trans = i < transParas.length ? transParas[i] : null;

    if (orig) lines.push(orig);
    if (trans) lines.push(trans);

    lines.push(''); // blank line separator
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
