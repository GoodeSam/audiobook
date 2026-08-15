/**
 * openDatabase failure modes.
 *
 * These exist because the original implementation listened only for `success`
 * and `error`. Anything else — most importantly `blocked`, fired when another
 * tab holds an older version open and the upgrade cannot run — left the promise
 * pending forever. Since it is cached, one blocked open poisoned every later
 * database call in the page, and checkpoint writes are awaited inside the audio
 * synthesis loop, so generation froze mid-chapter with no error and nothing
 * written to disk.
 *
 * jsdom has no IndexedDB, so the request object is faked. That is enough: what
 * is under test is which events settle the promise, not the storage engine.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';

/**
 * Install a fake `indexedDB.open` and return the request object the module
 * under test will receive. `drive` fires whichever event the test wants.
 */
function fakeIndexedDB(drive) {
  const req = {
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
    onblocked: null,
    result: null,
    error: null,
  };
  globalThis.indexedDB = {
    open: () => {
      // Async so the caller has attached its handlers first, as a real
      // implementation does.
      queueMicrotask(() => drive(req));
      return req;
    },
  };
  return req;
}

/** Fresh module instance — `_dbPromise` is module-level cached state. */
async function loadDb() {
  vi.resetModules();
  return import('./db.js');
}

afterEach(() => {
  delete globalThis.indexedDB;
  vi.useRealTimers();
});

describe('openDatabase', () => {
  it('rejects when another tab blocks the upgrade instead of hanging', async () => {
    fakeIndexedDB((req) => req.onblocked?.());
    const { openDatabase } = await loadDb();

    await expect(openDatabase()).rejects.toThrow(/其他标签页/);
  });

  it('does not cache a blocked open, so closing the other tab and retrying works', async () => {
    let attempt = 0;
    const db = { objectStoreNames: { contains: () => true } };
    globalThis.indexedDB = {
      open: () => {
        const req = { onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null, result: db };
        queueMicrotask(() => {
          attempt++;
          if (attempt === 1) req.onblocked?.();
          else req.onsuccess?.();
        });
        return req;
      },
    };
    const { openDatabase } = await loadDb();

    await expect(openDatabase()).rejects.toThrow();
    await expect(openDatabase()).resolves.toBe(db);
  });

  it('rejects when the open never fires any event at all', async () => {
    vi.useFakeTimers();
    fakeIndexedDB(() => { /* silence */ });
    const { openDatabase, DB_OPEN_TIMEOUT_MS } = await loadDb();

    const pending = openDatabase();
    const assertion = expect(pending).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(DB_OPEN_TIMEOUT_MS + 1);
    await assertion;
  });

  it('caches the connection across calls once it opens', async () => {
    const db = { objectStoreNames: { contains: () => true } };
    fakeIndexedDB((req) => { req.result = db; req.onsuccess?.(); });
    const { openDatabase } = await loadDb();

    expect(await openDatabase()).toBe(db);
    expect(await openDatabase()).toBe(db);
  });

  // Symmetric to the blocked case: this tab must not be the one blocking a
  // newer tab's upgrade.
  it('closes its connection when a newer tab requests a version change', async () => {
    const close = vi.fn();
    const db = { objectStoreNames: { contains: () => true }, close, onversionchange: null };
    fakeIndexedDB((req) => { req.result = db; req.onsuccess?.(); });
    const { openDatabase } = await loadDb();

    const opened = await openDatabase();
    expect(typeof opened.onversionchange).toBe('function');
    opened.onversionchange();
    expect(close).toHaveBeenCalled();

    // And the cached promise was dropped, so the next call reopens.
    const reopened = await openDatabase();
    expect(reopened).toBe(db);
  });

  it('rejects when IndexedDB is unavailable', async () => {
    delete globalThis.indexedDB;
    const { openDatabase } = await loadDb();

    await expect(openDatabase()).rejects.toThrow(/not available/);
  });
});
