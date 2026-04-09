/**
 * Tests for application state management.
 *
 * Verifies that the app state is properly reset after upload and navigation,
 * preventing the editor from becoming unresponsive due to stale flags.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createAppState, resetStateForNewBook } from './app-state.js';

describe('createAppState', () => {
  it('initializes with generating set to false', () => {
    const state = createAppState();
    expect(state.generating).toBe(false);
  });

  it('initializes with no active chapter', () => {
    const state = createAppState();
    expect(state.activeChapter).toBe(null);
  });

  it('initializes with empty selections', () => {
    const state = createAppState();
    expect(state.selectedChapters.size).toBe(0);
  });
});

describe('resetStateForNewBook', () => {
  it('resets generating to false even if it was true', () => {
    const state = createAppState();
    state.generating = true;
    resetStateForNewBook(state);
    expect(state.generating).toBe(false);
  });

  it('clears audio blobs', () => {
    const state = createAppState();
    state.audioBlobs = { 0: 'blob', 1: 'blob' };
    resetStateForNewBook(state);
    expect(Object.keys(state.audioBlobs).length).toBe(0);
  });

  it('clears active chapter', () => {
    const state = createAppState();
    state.activeChapter = 3;
    resetStateForNewBook(state);
    expect(state.activeChapter).toBe(null);
  });

  it('clears selected chapters', () => {
    const state = createAppState();
    state.selectedChapters.add(0);
    state.selectedChapters.add(1);
    resetStateForNewBook(state);
    expect(state.selectedChapters.size).toBe(0);
  });

  it('clears active tab back to original', () => {
    const state = createAppState();
    state.activeTab = 'translated';
    resetStateForNewBook(state);
    expect(state.activeTab).toBe('original');
  });

  it('sets the new book on state', () => {
    const state = createAppState();
    const book = { title: 'Test', chapters: [] };
    resetStateForNewBook(state, book);
    expect(state.book).toBe(book);
  });

  it('resets all flags in a single call after stuck generation', () => {
    const state = createAppState();
    // Simulate a stuck state after interrupted generation
    state.generating = true;
    state.activeChapter = 5;
    state.audioBlobs = { 0: 'blob' };
    state.selectedChapters.add(2);
    state.activeTab = 'translated';

    const book = { title: 'New Book', chapters: [{ title: 'Ch1' }] };
    resetStateForNewBook(state, book);

    expect(state.generating).toBe(false);
    expect(state.activeChapter).toBe(null);
    expect(Object.keys(state.audioBlobs).length).toBe(0);
    expect(state.selectedChapters.size).toBe(0);
    expect(state.activeTab).toBe('original');
    expect(state.book).toBe(book);
  });
});
