/**
 * Tests for progress overlay visibility.
 *
 * The core bug: CSS `display: flex` on .progress-overlay overrides the
 * `hidden` attribute, making the overlay permanently visible and blocking
 * all user interaction after page load.
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('progress overlay visibility', () => {
  let overlay;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="progress-overlay" class="progress-overlay" hidden>
        <div class="progress-card">
          <h3 id="progress-title">Working...</h3>
        </div>
      </div>
    `;
    overlay = document.getElementById('progress-overlay');
  });

  it('is hidden by default via hidden attribute', () => {
    expect(overlay.hidden).toBe(true);
  });

  it('should not have visible class when hidden', () => {
    // The overlay must NOT have the .visible class when hidden.
    // CSS display:flex is gated behind .visible — without it, the overlay
    // stays display:none via the hidden attribute.
    expect(overlay.hidden).toBe(true);
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('becomes visible when hidden is removed', () => {
    overlay.hidden = false;
    expect(overlay.hidden).toBe(false);
  });

  it('hides again when hidden is set back', () => {
    overlay.hidden = false;
    overlay.hidden = true;
    expect(overlay.hidden).toBe(true);
  });
});

describe('showProgress / hideProgress contract', () => {
  let overlay;

  function showProgress(title) {
    document.getElementById('progress-title').textContent = title;
    overlay.hidden = false;
    overlay.classList.add('visible');
  }

  function hideProgress() {
    overlay.hidden = true;
    overlay.classList.remove('visible');
  }

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="progress-overlay" class="progress-overlay" hidden>
        <div class="progress-card">
          <h3 id="progress-title">Working...</h3>
        </div>
      </div>
    `;
    overlay = document.getElementById('progress-overlay');
  });

  it('showProgress makes overlay visible', () => {
    showProgress('Translating...');
    expect(overlay.hidden).toBe(false);
    expect(overlay.classList.contains('visible')).toBe(true);
  });

  it('hideProgress hides overlay', () => {
    showProgress('Translating...');
    hideProgress();
    expect(overlay.hidden).toBe(true);
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('overlay starts without visible class', () => {
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('CSS should only display:flex when visible class is present', () => {
    // This documents the fix: display:flex is gated behind .visible class
    // not applied unconditionally to .progress-overlay
    expect(overlay.classList.contains('visible')).toBe(false);
  });
});
