/**
 * Tests for the long-run protection helpers.
 *
 * A chapter takes minutes of continuous WebSocket + fetch work, and nothing
 * guarded it: no unload warning, so a stray reload silently destroyed the run;
 * no wake lock, so a phone locking its screen froze the tab mid-chapter.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shouldWarnBeforeUnload,
  createWakeLock,
} from './generation-guard.js';

describe('shouldWarnBeforeUnload', () => {
  it('warns while audio is being generated', () => {
    expect(shouldWarnBeforeUnload({ generating: true, working: false })).toBe(true);
  });

  it('warns while a book is still being parsed', () => {
    expect(shouldWarnBeforeUnload({ generating: false, working: true })).toBe(true);
  });

  it('stays quiet when nothing is running', () => {
    expect(shouldWarnBeforeUnload({ generating: false, working: false })).toBe(false);
  });

  it('stays quiet for a missing state rather than throwing during unload', () => {
    expect(shouldWarnBeforeUnload(null)).toBe(false);
    expect(shouldWarnBeforeUnload(undefined)).toBe(false);
  });
});

describe('createWakeLock', () => {
  function fakeNavigator() {
    const sentinel = { released: false, release: vi.fn(async function () { this.released = true; }) };
    return {
      sentinel,
      nav: { wakeLock: { request: vi.fn(async () => sentinel) } },
    };
  }

  it('requests a screen wake lock on acquire', async () => {
    const { nav } = fakeNavigator();
    const lock = createWakeLock({ navigator: nav });

    await lock.acquire();

    expect(nav.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(lock.isHeld()).toBe(true);
  });

  it('does not stack multiple sentinels when acquired twice', async () => {
    const { nav } = fakeNavigator();
    const lock = createWakeLock({ navigator: nav });

    await lock.acquire();
    await lock.acquire();

    expect(nav.wakeLock.request).toHaveBeenCalledTimes(1);
  });

  it('releases the sentinel', async () => {
    const { nav, sentinel } = fakeNavigator();
    const lock = createWakeLock({ navigator: nav });

    await lock.acquire();
    await lock.release();

    expect(sentinel.release).toHaveBeenCalled();
    expect(lock.isHeld()).toBe(false);
  });

  it('is a no-op on browsers without the Wake Lock API', async () => {
    const lock = createWakeLock({ navigator: {} });

    await expect(lock.acquire()).resolves.toBeUndefined();
    expect(lock.isHeld()).toBe(false);
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it('survives a rejected request instead of aborting generation', async () => {
    const nav = { wakeLock: { request: vi.fn(async () => { throw new Error('NotAllowedError'); }) } };
    const lock = createWakeLock({ navigator: nav });

    await expect(lock.acquire()).resolves.toBeUndefined();
    expect(lock.isHeld()).toBe(false);
  });

  it('survives a rejected release', async () => {
    const sentinel = { release: vi.fn(async () => { throw new Error('already released'); }) };
    const nav = { wakeLock: { request: vi.fn(async () => sentinel) } };
    const lock = createWakeLock({ navigator: nav });

    await lock.acquire();
    await expect(lock.release()).resolves.toBeUndefined();
    expect(lock.isHeld()).toBe(false);
  });

  it('can be re-acquired after the system drops the lock on tab switch', async () => {
    // The browser auto-releases the sentinel when the page is hidden; coming
    // back to the foreground must be able to take it again.
    const { nav } = fakeNavigator();
    const lock = createWakeLock({ navigator: nav });

    await lock.acquire();
    await lock.release();
    await lock.acquire();

    expect(nav.wakeLock.request).toHaveBeenCalledTimes(2);
    expect(lock.isHeld()).toBe(true);
  });

  it('reports itself as not held after the sentinel fires its own release event', async () => {
    let onRelease = null;
    const sentinel = {
      release: vi.fn(async () => {}),
      addEventListener: (type, fn) => { if (type === 'release') onRelease = fn; },
    };
    const nav = { wakeLock: { request: vi.fn(async () => sentinel) } };
    const lock = createWakeLock({ navigator: nav });

    await lock.acquire();
    expect(lock.isHeld()).toBe(true);

    onRelease();
    expect(lock.isHeld()).toBe(false);
  });
});
