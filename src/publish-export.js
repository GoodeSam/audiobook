/**
 * Publish export — package a generated book for the remote library.
 *
 * The admin generates translations + audio in the browser, then exports a
 * ZIP containing book.json and per-chapter MP3s. `deploy/publish-book.sh`
 * uploads that ZIP's contents to the server and registers the book in
 * library/catalog.json.
 */

import { sanitizeFilename } from './chapter-export.js';

/**
 * Strip embedded images from published markdown. The player never renders
 * or narrates them (stripMarkdown removes every `![alt](url)` before
 * display/TTS), but a source EPUB that inlines illustrations as base64
 * data URIs can bloat a chapter's markdown by megabytes — and every user
 * downloads book.json in full before the reader shows anything. Since
 * images serve no purpose past this point, they're dropped here instead
 * of shipped to every listener.
 */
function stripImages(markdown) {
  if (!markdown) return markdown;
  return markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Filename for one chapter's audio in a given mode, e.g. "003-bilingual.mp3". */
function audioFilename(idx, mode) {
  return `${String(idx + 1).padStart(3, '0')}-${mode}.mp3`;
}

/** Filename for one chapter's playback timeline in a given mode. */
function timelineFilename(idx, mode) {
  return `${String(idx + 1).padStart(3, '0')}-${mode}.timeline.json`;
}

/**
 * Build the book.json manifest for publishing.
 * Pure function — testable without blobs.
 *
 * A chapter can have several audio modes generated for it (original,
 * bilingual, en-zh-en...) — all of them are published side by side so
 * listeners can pick which one to hear, instead of only the most recently
 * generated mode surviving.
 *
 * Per-sentence playback timelines are NOT embedded here — for a book with
 * many chapters of dense dialogue they can be several MB in total, and
 * every listener downloads book.json in full just to browse chapter
 * titles, long before any specific chapter's timing data is needed. Each
 * mode instead gets a `timelineFile` pointer to a small sidecar JSON file,
 * fetched lazily only when that chapter/mode is actually opened — the same
 * lazy-fetch pattern already used for the MP3s themselves.
 *
 * @param {object} book - { title, chapters: [{title, markdown, translatedMarkdown}] }
 * @param {string} bookId
 * @param {object} audioVariants - chapterIndex -> { [mode]: { blob, timeline } }
 * @returns {object} manifest with chapters[].audioFiles = { mode: { file, size, timelineFile } }
 */
export function buildPublishManifest(book, bookId, audioVariants = {}) {
  return {
    id: bookId,
    title: book.title,
    generatedAt: Date.now(),
    chapters: book.chapters.map((ch, idx) => {
      const variants = audioVariants[idx] || {};
      const audioFiles = {};
      for (const [mode, { blob, timeline }] of Object.entries(variants)) {
        if (!blob) continue;
        audioFiles[mode] = {
          file: audioFilename(idx, mode),
          size: blob.size || 0,
          timelineFile: (timeline && timeline.length > 0) ? timelineFilename(idx, mode) : null,
        };
      }
      return {
        title: ch.title,
        markdown: stripImages(ch.markdown),
        translatedMarkdown: ch.translatedMarkdown ? stripImages(ch.translatedMarkdown) : null,
        audioFiles,
      };
    }),
  };
}

/** How many chapters in a manifest have at least one audio mode. */
export function countAudioChapters(manifest) {
  return manifest.chapters.filter(ch => Object.keys(ch.audioFiles || {}).length > 0).length;
}

/**
 * Build the publish ZIP: book.json + one MP3 (+ one timeline sidecar JSON,
 * where applicable) per chapter/mode.
 * @returns {Promise<{blob: Blob, filename: string, manifest: object}>}
 */
export async function buildPublishZip(book, bookId, audioVariants) {
  const manifest = buildPublishManifest(book, bookId, audioVariants);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('book.json', JSON.stringify(manifest));
  for (let idx = 0; idx < book.chapters.length; idx++) {
    const variants = audioVariants[idx] || {};
    for (const [mode, { blob, timeline }] of Object.entries(variants)) {
      if (!blob) continue;
      zip.file(audioFilename(idx, mode), blob);
      if (timeline && timeline.length > 0) {
        zip.file(timelineFilename(idx, mode), JSON.stringify(timeline));
      }
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: `${sanitizeFilename(bookId)}_publish.zip`, manifest };
}
