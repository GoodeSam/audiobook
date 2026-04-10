/**
 * PDF parser — extracts text from PDF files and groups pages into chapters.
 *
 * Uses PDF.js (pdfjs-dist) for browser-based text extraction.
 * Since PDFs don't have a semantic chapter structure like EPUBs,
 * we detect chapter breaks from text patterns (e.g. "Chapter 1",
 * "第一章") and group pages accordingly.
 */

const CHAPTER_PATTERNS = [
  /^chapter\s+\d+/i,                     // Chapter 1, CHAPTER 12
  /^chapter\s+[ivxlcdm]+/i,              // Chapter IV
  /^part\s+\d+/i,                        // Part 1
  /^part\s+[ivxlcdm]+/i,                 // Part I
  /^part\s+(one|two|three|four|five|six|seven|eight|nine|ten)/i,
  /^第[一二三四五六七八九十百千\d]+[章节篇部回]/,  // 第一章, 第3章
  /^section\s+\d+/i,                     // Section 1
  /^prologue$/i,
  /^epilogue$/i,
  /^introduction$/i,
  /^conclusion$/i,
  /^appendix/i,
  /^前言$/,
  /^序言$/,
  /^后记$/,
  /^附录/,
];

const PAGES_PER_CHAPTER_DEFAULT = 10;

/**
 * Detect if a line of text marks a chapter break.
 * @param {string} text - First line of a page.
 * @returns {string|null} The chapter title if detected, null otherwise.
 */
export function detectChapterBreak(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Check first line only (chapter headings are typically the first line)
  const firstLine = trimmed.split('\n')[0].trim();
  if (!firstLine) return null;

  for (const pattern of CHAPTER_PATTERNS) {
    if (pattern.test(firstLine)) {
      return firstLine;
    }
  }
  return null;
}

/**
 * Group extracted page texts into chapter objects.
 * @param {string[]} pages - Array of text content per page.
 * @param {string} bookTitle - Fallback title.
 * @returns {Array<{title: string, markdown: string}>}
 */
export function groupPagesIntoChapters(pages, bookTitle) {
  if (pages.length === 0) {
    return [{ title: bookTitle, markdown: '' }];
  }

  // Scan for chapter breaks
  const breaks = []; // { pageIndex, title }
  for (let i = 0; i < pages.length; i++) {
    const chTitle = detectChapterBreak(pages[i]);
    if (chTitle) {
      breaks.push({ pageIndex: i, title: chTitle });
    }
  }

  // If chapter breaks found, group by them
  if (breaks.length > 0) {
    const chapters = [];
    for (let b = 0; b < breaks.length; b++) {
      const start = breaks[b].pageIndex;
      const end = b + 1 < breaks.length ? breaks[b + 1].pageIndex : pages.length;
      const pageTexts = pages.slice(start, end);
      chapters.push({
        title: breaks[b].title,
        markdown: pageTexts.join('\n\n'),
      });
    }

    // Include any pages before the first chapter break
    if (breaks[0].pageIndex > 0) {
      const preamble = pages.slice(0, breaks[0].pageIndex).join('\n\n');
      if (preamble.trim()) {
        chapters.unshift({ title: bookTitle, markdown: preamble });
      }
    }

    return chapters;
  }

  // No chapter breaks — group pages into chunks
  const chapters = [];
  for (let i = 0; i < pages.length; i += PAGES_PER_CHAPTER_DEFAULT) {
    const chunk = pages.slice(i, i + PAGES_PER_CHAPTER_DEFAULT);
    const chNum = Math.floor(i / PAGES_PER_CHAPTER_DEFAULT) + 1;
    chapters.push({
      title: chapters.length === 0 ? bookTitle : `Section ${chNum}`,
      markdown: chunk.join('\n\n'),
    });
  }

  return chapters;
}

/**
 * Parse a PDF file and extract chapters.
 *
 * @param {File} file - The PDF file.
 * @returns {Promise<{title: string, chapters: Array<{title: string, markdown: string}>}>}
 */
export async function parsePDF(file) {
  const pdfjsLib = await import('pdfjs-dist');

  // Set worker source for PDF.js
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const bookTitle = file.name.replace(/\.pdf$/i, '');

  // Extract text from each page
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join(' ');
    // Clean up: collapse whitespace, trim
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned) pages.push(cleaned);
  }

  const chapters = groupPagesIntoChapters(pages, bookTitle);

  return { title: bookTitle, chapters };
}
