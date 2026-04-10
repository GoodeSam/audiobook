/**
 * Checkpoint system for resumable translation and audio generation.
 *
 * Stores progress so interrupted operations can continue from the last
 * completed paragraph/segment instead of restarting from scratch.
 */

/**
 * Create a translation checkpoint.
 * @param {number} totalParagraphs - Total paragraphs in the chapter.
 * @param {string[]} translatedParagraphs - Already-translated paragraphs.
 * @returns {object}
 */
export function createTranslationCheckpoint(totalParagraphs, translatedParagraphs) {
  return {
    type: 'translation',
    completedIndex: translatedParagraphs.length,
    totalParagraphs,
    translatedParagraphs: [...translatedParagraphs],
  };
}

/**
 * Create an audio generation checkpoint.
 * @param {number} totalSegments - Total segments to synthesize.
 * @param {Blob[]} audioBlobs - Already-synthesized audio blobs.
 * @returns {object}
 */
export function createAudioCheckpoint(totalSegments, audioBlobs) {
  return {
    type: 'audio',
    completedIndex: audioBlobs.length,
    totalSegments,
    audioBlobs: [...audioBlobs],
  };
}

/**
 * Merge checkpoint paragraphs with newly translated paragraphs.
 * @param {object} checkpoint - Translation checkpoint.
 * @param {string[]} newParagraphs - Paragraphs translated in this session.
 * @returns {string[]} Complete translated paragraph list.
 */
export function mergeTranslationResult(checkpoint, newParagraphs) {
  return [...checkpoint.translatedParagraphs, ...newParagraphs];
}

/**
 * Check if a translation checkpoint covers all paragraphs.
 */
export function isTranslationComplete(checkpoint) {
  return checkpoint.completedIndex >= checkpoint.totalParagraphs;
}

/**
 * Check if an audio checkpoint covers all segments.
 */
export function isAudioComplete(checkpoint) {
  return checkpoint.completedIndex >= checkpoint.totalSegments;
}
