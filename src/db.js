/**
 * IndexedDB persistence layer.
 *
 * Stores everything the mobile app needs to work offline and across sessions:
 *   - users:    listener profiles on this device
 *   - books:    parsed books (chapters + translations)
 *   - audio:    generated per-chapter MP3 blobs + playback timelines
 *   - progress: per-user, per-chapter listening position and history
 *
 * All functions are promise-based thin wrappers; callers should treat
 * failures as non-fatal (the app still works in-memory without persistence).
 */

const DB_NAME = 'audiobook-app';
const DB_VERSION = 1;

let _dbPromise = null;

export function openDatabase() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('audio')) {
        const s = db.createObjectStore('audio', { keyPath: ['bookId', 'chapterIndex'] });
        s.createIndex('bookId', 'bookId');
      }
      if (!db.objectStoreNames.contains('progress')) {
        const s = db.createObjectStore('progress', { keyPath: ['userId', 'bookId', 'chapterIndex'] });
        s.createIndex('userId', 'userId');
        s.createIndex('bookId', 'bookId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
  return _dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const result = fn(s);
    t.oncomplete = () => resolve(result && result.result !== undefined ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
  });
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Users ──

export async function listUsers() {
  const db = await openDatabase();
  const users = await reqToPromise(db.transaction('users').objectStore('users').getAll());
  return users.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

export async function createUser(name) {
  const db = await openDatabase();
  const user = { id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now() };
  await tx(db, 'users', 'readwrite', s => s.put(user));
  return user;
}

export async function deleteUser(userId) {
  const db = await openDatabase();
  await tx(db, 'users', 'readwrite', s => s.delete(userId));
  // Remove the user's listening progress as well
  const t = db.transaction('progress', 'readwrite');
  const idx = t.objectStore('progress').index('userId');
  const keys = await reqToPromise(idx.getAllKeys(userId));
  for (const key of keys) t.objectStore('progress').delete(key);
  return new Promise((resolve, reject) => {
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}

// ── Books ──

export async function saveBook(book) {
  const db = await openDatabase();
  await tx(db, 'books', 'readwrite', s => s.put({ ...book, updatedAt: Date.now() }));
}

export async function getBook(bookId) {
  const db = await openDatabase();
  return reqToPromise(db.transaction('books').objectStore('books').get(bookId));
}

export async function listBooks() {
  const db = await openDatabase();
  const books = await reqToPromise(db.transaction('books').objectStore('books').getAll());
  return books.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export async function deleteBook(bookId) {
  const db = await openDatabase();
  await tx(db, 'books', 'readwrite', s => s.delete(bookId));
  // Cascade: audio + all users' progress for this book
  for (const store of ['audio', 'progress']) {
    const t = db.transaction(store, 'readwrite');
    const idx = t.objectStore(store).index('bookId');
    const keys = await reqToPromise(idx.getAllKeys(bookId));
    for (const key of keys) t.objectStore(store).delete(key);
    await new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }
}

// ── Audio ──

export async function saveChapterAudio(bookId, chapterIndex, { blob, timeline, audioMode }) {
  const db = await openDatabase();
  await tx(db, 'audio', 'readwrite', s => s.put({
    bookId, chapterIndex, blob, timeline: timeline || null, audioMode: audioMode || null,
    updatedAt: Date.now(),
  }));
}

export async function getBookAudio(bookId) {
  const db = await openDatabase();
  const idx = db.transaction('audio').objectStore('audio').index('bookId');
  return reqToPromise(idx.getAll(bookId));
}

// ── Listening progress ──

export async function saveProgress(record) {
  // record: { userId, bookId, chapterIndex, time, duration, chapterTitle, bookTitle }
  const db = await openDatabase();
  await tx(db, 'progress', 'readwrite', s => s.put({ ...record, updatedAt: Date.now() }));
}

export async function getProgress(userId, bookId, chapterIndex) {
  const db = await openDatabase();
  return reqToPromise(
    db.transaction('progress').objectStore('progress').get([userId, bookId, chapterIndex])
  );
}

/** All progress records for a user, most recent first. */
export async function getUserProgress(userId) {
  const db = await openDatabase();
  const idx = db.transaction('progress').objectStore('progress').index('userId');
  const records = await reqToPromise(idx.getAll(userId));
  return records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** Most recent listening position for a user within one book. */
export async function getLastPlayed(userId, bookId) {
  const records = await getUserProgress(userId);
  return records.find(r => r.bookId === bookId) || null;
}
