/**
 * Application state management.
 *
 * Extracted from main.js so state creation and reset logic are testable.
 * Ensures all flags (especially `generating`) are properly cleared on
 * new book upload, preventing the editor from becoming unresponsive.
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
    selectedChapters: new Set(),
  };
}

/**
 * Reset state for a new book upload.
 * Crucially resets `generating` to false — a stuck `true` value from a
 * previous interrupted operation would block all action buttons.
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
  state.selectedChapters = new Set();
}
