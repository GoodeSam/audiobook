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
    audioBlobs: {},
    activeChapter: null,
    activeTab: 'original',
    generating: false,
    working: false,         // true while handleFile is parsing an EPUB
    selectedChapters: new Set(),
  };
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
  state.audioBlobs = {};
  state.activeChapter = null;
  state.activeTab = 'original';
  state.generating = false;
  state.working = false;
  state.selectedChapters = new Set();
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
