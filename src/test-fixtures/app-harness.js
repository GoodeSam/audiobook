/**
 * Boots the real main.js inside jsdom so its orchestration can be tested.
 *
 * main.js is 2915 lines of DOM refs, event wiring, and business logic with no
 * exports, so the only honest way to characterize it is the way a user drives
 * it: load the real app shell, click the real buttons, watch what reaches
 * storage and what the screen says.
 *
 * Callers MUST declare the mocks themselves — `vi.mock` is hoisted per test
 * file and cannot be inherited from here:
 *
 *   vi.mock('./db.js');
 *   vi.mock('./remote-library.js');
 *   vi.mock('./library-api.js');
 *   vi.mock('./edge-tts.js');
 *   vi.mock('./ms-translator.js');
 *   vi.mock('./publish-export.js');
 *
 * Nothing in main.js was changed to make this possible. That is the point: a
 * safety net has to pin the code as it is before anything gets restructured.
 */
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(resolve(here, '..', '..', 'index.html'), 'utf8');

/** This jsdom build ships a non-functional localStorage, and main.js reads it
 *  at module scope — so a working one must exist before the import. */
function installLocalStorage() {
  const store = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    },
  });
}

/**
 * Start a fresh instance of the app and return its mocked collaborators.
 *
 * @param {object} [options]
 * @param {boolean} [options.admin=true] - Boot into admin mode. Generating and
 *   publishing are admin actions; in listener mode the chapter rows render a
 *   completely different view and never reach the admin branches at all.
 * @returns {Promise<object>} mocked modules plus main.js's debug hook.
 */
export async function bootApp({ admin = true } = {}) {
  // main.js attaches 65 listeners at import time, so a cached module plus a
  // rebuilt DOM would leave every button dead.
  vi.resetModules();
  installLocalStorage();
  if (admin) window.localStorage.setItem('audiobook.adminMode', '1');

  // The real app shell, so ids and structure match production exactly.
  const body = indexHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
  document.body.innerHTML = body.replace(/<script[\s\S]*?<\/script>/gi, '');

  const db = await import('../db.js');
  const remote = await import('../remote-library.js');
  const edgeTts = await import('../edge-tts.js');
  const api = await import('../library-api.js');
  const publishExport = await import('../publish-export.js');

  // Defaults for a clean, empty install. Individual tests override.
  db.listUsers.mockResolvedValue([{ id: 'u1', name: 'Default' }]);
  db.createUser.mockResolvedValue({ id: 'u1', name: 'Default' });
  db.listBooks.mockResolvedValue([]);
  db.getBook.mockResolvedValue(null);
  db.getBookAudio.mockResolvedValue([]);
  db.getBookAudioCheckpoints.mockResolvedValue([]);
  db.getLastPlayed.mockResolvedValue(null);
  db.openDatabase.mockResolvedValue({});
  db.saveChapterAudio.mockResolvedValue(undefined);
  remote.fetchCatalog.mockResolvedValue({ books: [] });
  remote.visibleBooks.mockReturnValue([]);
  remote.isKnownCode.mockReturnValue(false);
  edgeTts.validateVoiceSettings.mockReturnValue(null);
  api.makePublishId?.mockReturnValue?.('pub-1');

  await import('../main.js');
  return { db, remote, edgeTts, api, publishExport, ...window.__audiobook };
}

/** Text currently shown in the toast strip. */
export function toastText() {
  return document.getElementById('toast-container')?.textContent ?? '';
}
