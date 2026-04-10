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
 * Images and horizontal rules are preserved untranslated.
 * Headings ARE translated (handled separately to preserve # markers).
 * @param {string} para
 * @returns {boolean}
 */
export function isSkipParagraph(para) {
  const trimmed = para.trim();
  if (!trimmed) return true;
  if (/^!\[.*\]\(.*\)$/.test(trimmed)) return true;
  if (/^---+$/.test(trimmed)) return true;
  return false;
}

/**
 * Extract heading level and text from a heading paragraph.
 * @param {string} para - e.g. "## Chapter Title"
 * @returns {{ prefix: string, text: string } | null}
 */
export function parseHeading(para) {
  const match = para.trim().match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  return { prefix: match[1], text: match[2] };
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
