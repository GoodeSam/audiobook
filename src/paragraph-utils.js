/**
 * Shared paragraph splitting and classification utilities.
 *
 * Used by translation, TTS, bilingual view, progress counting, and export
 * to ensure consistent paragraph handling across the app.
 */

/**
 * Split markdown text into paragraphs.
 * @param {string} text
 * @returns {string[]}
 */
export function splitParagraphs(text) {
  if (!text || !text.trim()) return [];
  return text.split(/\n\n+/).filter(p => p.trim());
}

/**
 * Check if a paragraph should be skipped during translation.
 * Headings, images, and horizontal rules are preserved untranslated.
 * @param {string} para
 * @returns {boolean}
 */
export function isSkipParagraph(para) {
  const trimmed = para.trim();
  if (!trimmed) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^!\[.*\]\(.*\)$/.test(trimmed)) return true;
  if (/^---+$/.test(trimmed)) return true;
  return false;
}

/**
 * Check if a paragraph is a heading.
 * @param {string} para
 * @returns {boolean}
 */
export function isHeading(para) {
  return /^#{1,6}\s+/.test(para.trim());
}

/**
 * Count only translatable paragraphs in a markdown string.
 * @param {string} markdown
 * @returns {number}
 */
export function countTranslatableParagraphs(markdown) {
  return splitParagraphs(markdown).filter(p => !isSkipParagraph(p)).length;
}
