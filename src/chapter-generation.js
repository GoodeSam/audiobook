/**
 * One chapter's audio generation, start to finish, with no DOM.
 *
 * This sequence used to exist twice — in generateSingleChapter and in
 * generateMultipleChapters — and the copies drifted. Both bugs found while
 * building the safety net were divergences between them:
 *
 *  - a repaint issued from `catch` in one copy but from `finally` in the other,
 *    leaving a dead run claiming to still be running;
 *  - a commit order that deleted the resume checkpoint before the finished MP3
 *    was known to be saved, so a failed write destroyed both halves at once.
 *
 * The fix for a class of bug caused by duplication is to stop duplicating. This
 * module owns the sequence and its one invariant; callers own the UI.
 *
 * **The invariant:** at every instant, either a resumable checkpoint or a
 * finished MP3 exists on disk. The checkpoint is therefore cleared only after
 * `persist` confirms the audio landed, and never on a failure path.
 */

/** True for the sentinel `cancelGeneration()` raises — a user action, not a fault. */
function isCancellation(err) {
  return Boolean(err && typeof err.message === 'string' && err.message.includes('cancelled'));
}

/**
 * Generate one chapter and commit the result durably.
 *
 * Every collaborator is injected so the sequence can be tested without a
 * browser, a WebSocket, or IndexedDB.
 *
 * @param {object} options
 * @param {{title?: string, markdown: string, translatedMarkdown?: string|null}} options.chapter
 * @param {string} options.audioMode
 * @param {{voiceEn: string, voiceZh: string, speechRateEn: number, speechRateZh: number}} options.voice
 * @param {object|null} [options.checkpoint] - Stored resume point, if any. The
 *   generator validates it against the real segment count and ignores it when
 *   it no longer matches.
 * @param {Function} options.generate - `generateChapterAudio`.
 * @param {Function} options.commit - `(blob, timeline) => void`; record the
 *   finished audio in memory. Called before `persist` so the value being saved
 *   is the value the app is holding.
 * @param {Function} options.persist - `() => Promise<boolean>`; write the
 *   finished audio durably. **Must report failure rather than throw** — its
 *   return value is what guards the checkpoint.
 * @param {Function} options.clearCheckpoint - `() => Promise<void>`; drop the
 *   resume point. Called only after a confirmed persist.
 * @param {Function} [options.translateTexts] - Sentence-mode translator.
 * @param {Function} [options.onResume] - `({resuming, startIndex, totalSegments})`.
 * @param {Function} [options.onStatus] - `(message)`.
 * @param {Function} [options.onProgress] - `(current, total)`.
 * @param {Function} [options.onCheckpoint] - `(checkpoint) => Promise<void>`;
 *   awaited by the generator, which is what keeps storage writes ordered.
 * @returns {Promise<{ok: boolean, blob?: Blob, timeline?: Array|null,
 *   error?: Error, cancelled?: boolean, persistFailed?: boolean}>}
 *   Never throws: a caller deciding what to show the user should not also have
 *   to run a try/catch around it.
 */
export async function runChapterGeneration({
  chapter,
  audioMode,
  voice,
  checkpoint = null,
  generate,
  commit,
  persist,
  clearCheckpoint,
  translateTexts,
  onResume,
  onStatus,
  onProgress,
  onCheckpoint,
}) {
  let blob;
  let timeline;
  try {
    ({ blob, timeline } = await generate({
      originalText: chapter.markdown,
      translatedText: chapter.translatedMarkdown,
      audioMode,
      voiceEn: voice.voiceEn,
      voiceZh: voice.voiceZh,
      speechRateEn: voice.speechRateEn,
      speechRateZh: voice.speechRateZh,
      checkpoint,
      translateTexts,
      onResume: (info) => onResume?.(info),
      onStatus: (msg) => onStatus?.(msg),
      onProgress: (current, total) => onProgress?.(current, total),
      onCheckpoint: (cp) => onCheckpoint?.(cp),
    }));
  } catch (err) {
    // Nothing is committed and nothing is cleared: the checkpoint written
    // during the run is what makes the retry resume instead of restart.
    return { ok: false, error: err, cancelled: isCancellation(err) };
  }

  commit(blob, timeline);

  // The checkpoint outlives a failed save on purpose — see the invariant above.
  if (!await persist()) {
    return { ok: false, persistFailed: true, blob, timeline };
  }

  await clearCheckpoint();
  return { ok: true, blob, timeline };
}
