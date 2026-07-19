/**
 * Remote library — admin-published books served as static files.
 *
 * The server hosts a catalog plus per-book folders:
 *   library/catalog.json                  → { books: [{id, title, chapterCount,
 *                                             access, updatedAt}] }
 *   library/<bookId>/book.json            → { id, title, chapters: [{title,
 *                                             markdown, translatedMarkdown,
 *                                             audioFile, audioMode, timeline}] }
 *   library/<bookId>/NNN.mp3              → per-chapter audio
 *
 * `access` is either the string "public" or an array of access codes.
 * Users log in with an access code assigned by the admin (WeChat tumei321123);
 * the code only controls which books their shelf shows — this is a private
 * learning service, not a security boundary.
 */

const LIBRARY_PATH = 'library';

/**
 * Which catalog books are visible for an access code.
 * @param {{books?: Array}} catalog
 * @param {string} code - Access code (case-insensitive). Empty → public only.
 * @returns {Array} matching book entries, newest first.
 */
export function visibleBooks(catalog, code) {
  if (!catalog || !Array.isArray(catalog.books)) return [];
  const norm = (code || '').trim().toLowerCase();
  return catalog.books
    .filter(b => {
      if (b.access === 'public') return true;
      if (!norm) return false;
      return Array.isArray(b.access) && b.access.some(c => String(c).toLowerCase() === norm);
    })
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Whether an access code is accepted for login: either pre-registered in
 * the catalog's validCodes list (admin's issued codes) or already assigned
 * to at least one book. A registered code with no books yet logs in to an
 * empty shelf ("contact the admin to add books").
 */
export function isKnownCode(catalog, code) {
  const norm = (code || '').trim().toLowerCase();
  if (!norm) return false;
  if (!catalog) return false;
  if (Array.isArray(catalog.validCodes) &&
      catalog.validCodes.some(c => String(c).toLowerCase() === norm)) {
    return true;
  }
  if (!Array.isArray(catalog.books)) return false;
  return catalog.books.some(b =>
    Array.isArray(b.access) && b.access.some(c => String(c).toLowerCase() === norm)
  );
}

export async function fetchCatalog(baseUrl = '') {
  const res = await fetch(`${baseUrl}${LIBRARY_PATH}/catalog.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Catalog unavailable (${res.status})`);
  return res.json();
}

export async function fetchRemoteBook(bookId, baseUrl = '') {
  const res = await fetch(`${baseUrl}${LIBRARY_PATH}/${encodeURIComponent(bookId)}/book.json`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Book unavailable (${res.status})`);
  return res.json();
}

/**
 * Download a chapter MP3, optionally streaming progress.
 * @param {object} [opts] - { onProgress(loadedBytes, totalBytes), signal }
 *   totalBytes is 0 when the server omits Content-Length.
 */
export async function fetchRemoteAudio(bookId, audioFile, baseUrl = '', opts = {}) {
  const { onProgress, signal } = opts;
  const res = await fetch(
    `${baseUrl}${LIBRARY_PATH}/${encodeURIComponent(bookId)}/${audioFile}`,
    signal ? { signal } : undefined
  );
  if (!res.ok) throw new Error(`Audio unavailable (${res.status})`);
  if (!onProgress || !res.body || typeof res.body.getReader !== 'function') {
    return res.blob();
  }
  const total = Number(res.headers?.get?.('content-length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  return new Blob(chunks, { type: 'audio/mpeg' });
}
