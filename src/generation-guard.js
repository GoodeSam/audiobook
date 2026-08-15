/**
 * Protection for long-running generation.
 *
 * Generating one chapter is minutes of continuous WebSocket + fetch work, and
 * it had no guards at all: a stray reload destroyed the run without a prompt,
 * and a phone locking its screen froze the tab mid-chapter.
 *
 * Neither of these makes progress durable — that is the checkpoint store's job
 * (see audio-checkpoint-store.js). A browser will not wait for asynchronous
 * IndexedDB writes during unload, so `beforeunload` can only *warn*. These are
 * mitigations that reduce how often an interruption happens, not a substitute
 * for persisting as you go.
 */

/**
 * Should leaving the page prompt for confirmation right now?
 *
 * @param {object|null} state - App state ({ generating, working }).
 * @returns {boolean}
 */
export function shouldWarnBeforeUnload(state) {
  if (!state) return false;
  return Boolean(state.generating || state.working);
}

/**
 * Screen Wake Lock wrapper that degrades silently.
 *
 * Every failure mode here is non-fatal: an unsupported browser, a denied
 * request, or a double release must never interrupt synthesis.
 *
 * @param {object} [options]
 * @param {object} [options.navigator] - Injected for testing.
 * @returns {{acquire: Function, release: Function, isHeld: Function}}
 */
export function createWakeLock({ navigator: nav = globalThis.navigator } = {}) {
  let sentinel = null;

  return {
    async acquire() {
      if (sentinel) return;                 // already held — don't stack sentinels
      if (!nav?.wakeLock?.request) return;  // unsupported (Safari < 16.4, Firefox)
      try {
        const s = await nav.wakeLock.request('screen');
        sentinel = s;
        // The browser auto-releases when the page is hidden; track that so a
        // later acquire() actually re-requests instead of assuming it is held.
        s?.addEventListener?.('release', () => { sentinel = null; });
      } catch {
        sentinel = null; // denied (no user gesture, battery saver) — carry on
      }
    },

    async release() {
      const s = sentinel;
      sentinel = null;
      if (!s) return;
      try {
        await s.release();
      } catch { /* already released by the browser */ }
    },

    isHeld() { return sentinel !== null; },
  };
}
