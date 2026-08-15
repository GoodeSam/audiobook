/**
 * Application state management.
 *
 * Extracted from main.js so state creation and reset logic are testable.
 * Ensures all flags (especially `generating` and `working`) are properly
 * cleared on new book upload and errors, preventing the editor from
 * becoming unresponsive.
 */

/**
 * Create a fresh application state object.
 * @returns {object}
 */
export function createAppState() {
  return {
    book: null,
    bookId: null,           // stable id for library persistence (derived from title)
    audioBlobs: {},         // chapterIndex -> Blob for the current/last-generated mode
    audioTimelines: {},     // chapterIndex -> timeline array for the current mode (see audio-timeline.js)
    audioModes: {},         // chapterIndex -> audio mode the current MP3 was generated with
    audioVariants: {},      // chapterIndex -> { [audioMode]: { blob, timeline } } — every generated mode, not just the current one
    remoteId: null,         // remote-library book id when opened from the shelf
    remoteAudioMeta: {},    // chapterIndex -> { file } for audio not yet downloaded
    activeChapter: null,
    activeTab: 'original',
    generating: false,
    working: false,         // true while handleFile is parsing an EPUB
    selectedChapters: new Set(),
    translationCheckpoints: {},  // chapterIndex -> { completedIndex, translatedParagraphs, totalParagraphs }
    // chapterIndex -> audioMode -> { completedIndex, audioBlobs, totalSegments, audioMode }
    // Keyed by mode as well as chapter: a chapter interrupted in `bilingual`
    // must not hand its blobs to an `original` run, whose segment list is a
    // completely different length.
    audioCheckpoints: {},
  };
}

/** Store one chapter/mode's in-progress audio checkpoint. */
export function setAudioCheckpoint(state, chapterIndex, audioMode, checkpoint) {
  if (!state.audioCheckpoints[chapterIndex]) state.audioCheckpoints[chapterIndex] = {};
  state.audioCheckpoints[chapterIndex][audioMode] = checkpoint;
}

/** Retrieve one chapter/mode's checkpoint, or null. */
export function getAudioCheckpoint(state, chapterIndex, audioMode) {
  return state.audioCheckpoints[chapterIndex]?.[audioMode] ?? null;
}

/** Drop one chapter/mode's checkpoint, leaving the chapter's other modes alone. */
export function clearAudioCheckpoint(state, chapterIndex, audioMode) {
  const forChapter = state.audioCheckpoints[chapterIndex];
  if (!forChapter) return;
  delete forChapter[audioMode];
  if (Object.keys(forChapter).length === 0) delete state.audioCheckpoints[chapterIndex];
}

/**
 * The furthest-along interrupted mode for a chapter, for the "已中断 (127/340)"
 * row badge — the signal that was missing entirely, which is why a dead run
 * looked identical to a finished one.
 *
 * @returns {{audioMode: string, completedIndex: number, totalSegments: number}|null}
 */
export function audioCheckpointSummary(state, chapterIndex) {
  const forChapter = state.audioCheckpoints[chapterIndex];
  if (!forChapter) return null;
  let best = null;
  for (const [audioMode, cp] of Object.entries(forChapter)) {
    if (!cp || !(cp.completedIndex > 0)) continue;
    if (!best || cp.completedIndex > best.completedIndex) {
      best = { audioMode, completedIndex: cp.completedIndex, totalSegments: cp.totalSegments };
    }
  }
  return best;
}

/**
 * Reset state for a new book upload.
 * Clears all operational flags so the editor is fully interactive.
 *
 * @param {object} state - The app state object to reset.
 * @param {object} [book] - The new book to set.
 */
export function resetStateForNewBook(state, book) {
  state.book = book || null;
  state.bookId = null;
  state.audioBlobs = {};
  state.audioTimelines = {};
  state.audioModes = {};
  state.audioVariants = {};
  state.remoteId = null;
  state.remoteAudioMeta = {};
  state.activeChapter = null;
  state.activeTab = 'original';
  state.generating = false;
  state.working = false;
  state.selectedChapters = new Set();
  state.translationCheckpoints = {};
  state.audioCheckpoints = {};
}

/**
 * Reset operational flags on error without clearing existing book/chapter data.
 * Used when an upload fails or an operation errors out, so the UI becomes
 * responsive again while preserving any previously loaded content.
 *
 * @param {object} state
 */
export function resetStateOnError(state) {
  state.generating = false;
  state.working = false;
}
