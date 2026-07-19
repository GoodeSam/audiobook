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
 * Build the book.json manifest for publishing.
 * Pure function — testable without blobs.
 *
 * @param {object} book - { title, chapters: [{title, markdown, translatedMarkdown}] }
 * @param {string} bookId
 * @param {object} audioBlobs - chapterIndex -> Blob
 * @param {object} audioTimelines - chapterIndex -> timeline array
 * @param {object} audioModes - chapterIndex -> audio mode string
 * @returns {object} manifest with chapters[].audioFile set for chapters that have audio
 */
export function buildPublishManifest(book, bookId, audioBlobs, audioTimelines = {}, audioModes = {}) {
  return {
    id: bookId,
    title: book.title,
    generatedAt: Date.now(),
    chapters: book.chapters.map((ch, idx) => ({
      title: ch.title,
      markdown: ch.markdown,
      translatedMarkdown: ch.translatedMarkdown || null,
      audioFile: audioBlobs[idx] ? `${String(idx + 1).padStart(3, '0')}.mp3` : null,
      audioMode: audioBlobs[idx] ? (audioModes[idx] || null) : null,
      timeline: audioBlobs[idx] ? (audioTimelines[idx] || null) : null,
    })),
  };
}

/** How many chapters in a manifest have audio. */
export function countAudioChapters(manifest) {
  return manifest.chapters.filter(ch => ch.audioFile).length;
}

/**
 * Build the publish ZIP: book.json + NNN.mp3 files.
 * @returns {Promise<{blob: Blob, filename: string, manifest: object}>}
 */
export async function buildPublishZip(book, bookId, audioBlobs, audioTimelines, audioModes) {
  const manifest = buildPublishManifest(book, bookId, audioBlobs, audioTimelines, audioModes);
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  zip.file('book.json', JSON.stringify(manifest));
  for (let idx = 0; idx < book.chapters.length; idx++) {
    if (audioBlobs[idx]) {
      zip.file(`${String(idx + 1).padStart(3, '0')}.mp3`, audioBlobs[idx]);
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, filename: `${sanitizeFilename(bookId)}_publish.zip`, manifest };
}
