/**
 * Chapter export utilities.
 *
 * Provides functions for exporting one or multiple chapters as Markdown files
 * in three formats: original, translated-only, and bilingual (alternating).
 */

import { buildBilingualMarkdown } from './bilingual-view.js';

/**
 * Sanitize a string for use as a filename.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*!]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
    .replace(/-+$/, '') || 'untitled';
}

/**
 * Export a single chapter as a markdown file descriptor.
 * @param {{ title: string, markdown: string }} chapter
 * @returns {{ filename: string, content: string }}
 */
export function exportChapterAsMarkdown(chapter) {
  return {
    filename: `${sanitizeFilename(chapter.title)}.md`,
    content: chapter.markdown,
  };
}

/**
 * Export multiple chapters as markdown file descriptors.
 *
 * @param {Array<{title: string, markdown: string, translatedMarkdown?: string}>} chapters
 * @param {number[]} [indices] - Chapter indices to export. If omitted, exports all.
 * @param {object} [options]
 * @param {boolean} [options.includeTranslation=false] - Include translated-only files.
 * @param {boolean} [options.includeBilingual=false] - Include bilingual (alternating) files.
 * @returns {Array<{filename: string, content: string}>}
 */
export function exportMultipleChapters(chapters, indices, options = {}) {
  const { includeTranslation = false, includeBilingual = false } = options;
  const selected = indices || chapters.map((_, i) => i);
  const files = [];

  for (const idx of selected) {
    if (idx < 0 || idx >= chapters.length) continue;
    const ch = chapters[idx];
    const prefix = String(idx + 1).padStart(3, '0');
    const safeName = sanitizeFilename(ch.title);

    files.push({
      filename: `${prefix}_${safeName}.md`,
      content: ch.markdown,
    });

    if (includeTranslation && ch.translatedMarkdown) {
      files.push({
        filename: `${prefix}_${safeName}_translated.md`,
        content: ch.translatedMarkdown,
      });
    }

    if (includeBilingual && ch.translatedMarkdown) {
      files.push({
        filename: `${prefix}_${safeName}_bilingual.md`,
        content: buildBilingualMarkdown(ch.markdown, ch.translatedMarkdown),
      });
    }
  }

  return files;
}
