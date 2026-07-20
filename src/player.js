/**
 * Listening player — full-screen mobile-first playback view.
 *
 * Shows the chapter's ENGLISH text only (Chinese audio plays, but Chinese
 * text is never rendered), highlights the paragraph and — for English
 * segments — the exact sentence being spoken, synced to audio time via the
 * per-chapter timeline generated alongside the MP3 (see audio-timeline.js).
 *
 * Two view modes, toggled by the user and remembered across sessions:
 *  - "full": the whole chapter text, auto-scrolled to the active sentence.
 *  - "subtitle": only the current sentence plus its neighbors, in large
 *    type — a focused, subtitle-style reading mode for mobile.
 */

import {
  findTimelineIndex,
  findSentenceIndex,
  formatTime,
} from './audio-timeline.js';
import { splitIntoParagraphs, stripMarkdown, splitIntoSentences } from './edge-tts.js';

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5];
const PROGRESS_SAVE_INTERVAL_MS = 5000;
const VIEW_MODE_KEY = 'audiobook-player-view-mode';

export class Player {
  /**
   * @param {object} opts
   * @param {object} opts.elements - DOM elements (see index.html #player-screen).
   * @param {Function} [opts.onSaveProgress] - ({chapterIndex, time, duration}) called periodically.
   * @param {Function} [opts.onRequestChapter] - (direction: -1|1) → chapter switch handled by host.
   * @param {Function} [opts.onClose]
   */
  constructor({ elements, onSaveProgress, onRequestChapter, onClose }) {
    this.el = elements;
    this.onSaveProgress = onSaveProgress || (() => {});
    this.onRequestChapter = onRequestChapter || (() => {});
    this.onClose = onClose || (() => {});

    this.audio = new Audio();
    this.audio.preload = 'auto';
    this._url = null;
    this.timeline = null;
    this.chapterIndex = null;
    this._activeEntry = -1;
    this._activeSentence = -1;
    this._rateIndex = 1; // 1.0×
    this._raf = null;
    this._lastSave = 0;
    this._autoScrolling = false;
    this._lastManualScroll = 0;
    this._seeking = false;
    this._flatSentences = [];
    this._viewMode = localStorage.getItem(VIEW_MODE_KEY) === 'subtitle' ? 'subtitle' : 'full';

    this._bindEvents();
    this._applyViewMode();
  }

  _bindEvents() {
    const { el, audio } = this;

    el.btnPlay.addEventListener('click', () => this.toggle());
    el.btnBack15.addEventListener('click', () => this.seekBy(-15));
    el.btnFwd15.addEventListener('click', () => this.seekBy(15));
    el.btnPrev.addEventListener('click', () => this.onRequestChapter(-1));
    el.btnNext.addEventListener('click', () => this.onRequestChapter(1));
    el.btnRate.addEventListener('click', () => this._cycleRate());
    el.btnClose.addEventListener('click', () => this.close());
    el.btnMode.addEventListener('click', () => this._toggleViewMode());

    el.seek.addEventListener('input', () => {
      this._seeking = true;
      el.timeCur.textContent = formatTime(parseFloat(el.seek.value));
    });
    el.seek.addEventListener('change', () => {
      audio.currentTime = parseFloat(el.seek.value);
      this._seeking = false;
      this._saveProgress(true);
    });

    audio.addEventListener('play', () => {
      el.btnPlay.textContent = '⏸';
      el.btnPlay.setAttribute('aria-label', 'Pause');
      this._startTick();
      this._updateMediaSession('playing');
    });
    audio.addEventListener('pause', () => {
      el.btnPlay.textContent = '▶';
      el.btnPlay.setAttribute('aria-label', 'Play');
      this._stopTick();
      this._saveProgress(true);
      this._updateMediaSession('paused');
    });
    audio.addEventListener('ended', () => {
      this._saveProgress(true);
      this.onRequestChapter(1); // auto-advance; host ignores if no next chapter
    });
    audio.addEventListener('loadedmetadata', () => {
      el.seek.max = audio.duration || 0;
      el.timeTotal.textContent = formatTime(audio.duration);
    });
    audio.addEventListener('timeupdate', () => this._tick());

    // Suppress auto-scroll briefly after the user scrolls the text manually
    el.text.addEventListener('scroll', () => {
      if (!this._autoScrolling) this._lastManualScroll = Date.now();
    }, { passive: true });
  }

  /**
   * Open a chapter in the player.
   * @param {object} opts
   * @param {string} opts.bookTitle
   * @param {string} opts.chapterTitle
   * @param {number} opts.chapterIndex
   * @param {string} opts.originalText - Original (English) chapter markdown.
   * @param {Blob} opts.blob - Chapter MP3.
   * @param {Array|null} opts.timeline
   * @param {number} [opts.resumeTime=0]
   * @param {boolean} [opts.autoplay=true]
   */
  openChapter({ bookTitle, chapterTitle, chapterIndex, originalText, blob, timeline, resumeTime = 0, autoplay = true }) {
    this._saveProgressIfOpen();
    this._cleanupUrl();

    this.chapterIndex = chapterIndex;
    this.timeline = timeline || null;
    this._activeEntry = -1;
    this._activeSentence = -1;
    this._lastSave = Date.now();

    this.el.bookTitle.textContent = bookTitle;
    this.el.chapterTitle.textContent = chapterTitle;
    this._renderText(originalText);
    if (this._viewMode === 'subtitle') this._updateSubtitleView(this._flatSentences[0] || null);

    this._url = URL.createObjectURL(blob);
    this.audio.src = this._url;
    this.audio.playbackRate = PLAYBACK_RATES[this._rateIndex];
    if (resumeTime > 0) {
      const start = () => { this.audio.currentTime = resumeTime; };
      if (this.audio.readyState >= 1) start();
      else this.audio.addEventListener('loadedmetadata', start, { once: true });
    }
    this.el.seek.value = resumeTime || 0;
    this.el.timeCur.textContent = formatTime(resumeTime || 0);

    this._setMediaSessionMetadata(bookTitle, chapterTitle);
    if (autoplay) this.audio.play().catch(() => {/* autoplay blocked — user taps play */});
  }

  /**
   * Render the chapter's English text as paragraphs of sentence spans.
   * Only paragraphs that contain non-Chinese content are shown; the player
   * never displays Chinese text even when the audio includes it.
   */
  _renderText(originalText) {
    const container = this.el.text;
    container.innerHTML = '';
    this._flatSentences = [];
    const paras = splitIntoParagraphs(originalText || '');
    for (let i = 0; i < paras.length; i++) {
      const clean = stripMarkdown(paras[i]);
      if (!clean.trim()) continue;
      const p = document.createElement('p');
      p.className = 'player-para';
      p.dataset.para = i;
      const sentences = splitIntoSentences(clean);
      if (sentences.length > 0) {
        for (let s = 0; s < sentences.length; s++) {
          const span = document.createElement('span');
          span.className = 'player-sentence';
          span.dataset.sentence = s;
          span.dataset.flatIndex = this._flatSentences.length;
          span.textContent = sentences[s];
          this._flatSentences.push(span);
          p.appendChild(span);
          p.appendChild(document.createTextNode(' '));
        }
      } else {
        p.textContent = clean;
      }
      container.appendChild(p);
    }
    container.scrollTop = 0;
  }

  // ── Playback controls ──

  toggle() {
    if (this.audio.paused) this.audio.play().catch(() => {});
    else this.audio.pause();
  }

  seekBy(delta) {
    const d = this.audio.duration || 0;
    this.audio.currentTime = Math.max(0, Math.min(d, this.audio.currentTime + delta));
    this._saveProgress(true);
  }

  _cycleRate() {
    this._rateIndex = (this._rateIndex + 1) % PLAYBACK_RATES.length;
    const rate = PLAYBACK_RATES[this._rateIndex];
    this.audio.playbackRate = rate;
    this.el.btnRate.textContent = `${rate.toFixed(2).replace(/0$/, '').replace(/\.$/, '')}×`;
  }

  close() {
    this._saveProgressIfOpen();
    this.audio.pause();
    this._cleanupUrl();
    this.chapterIndex = null;
    this.onClose();
  }

  get isOpen() {
    return this.chapterIndex !== null;
  }

  // ── Sync loop ──

  _startTick() {
    if (this._raf) return;
    const loop = () => {
      this._tick();
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  _stopTick() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
  }

  _tick() {
    const t = this.audio.currentTime;

    if (!this._seeking) {
      this.el.seek.value = t;
      this.el.timeCur.textContent = formatTime(t);
    }

    if (Date.now() - this._lastSave > PROGRESS_SAVE_INTERVAL_MS && !this.audio.paused) {
      this._saveProgress();
    }

    if (!this.timeline) return;
    const idx = findTimelineIndex(this.timeline, t);
    if (idx === -1) return;
    const entry = this.timeline[idx];
    const sentIdx = entry.lang === 'en' ? findSentenceIndex(entry, t) : -1;
    if (idx !== this._activeEntry || sentIdx !== this._activeSentence) {
      this._activeEntry = idx;
      this._activeSentence = sentIdx;
      this._applyHighlight(entry, sentIdx);
    }
  }

  /**
   * Highlight the active paragraph; for English segments also the sentence.
   * Chinese segments highlight the corresponding English paragraph with a
   * distinct style (the Chinese translation of it is what's being spoken).
   */
  _applyHighlight(entry, sentIdx) {
    const container = this.el.text;
    container.querySelectorAll('.player-para.active, .player-para.zh-active').forEach(el => {
      el.classList.remove('active', 'zh-active');
    });
    container.querySelectorAll('.player-sentence.speaking').forEach(el => {
      el.classList.remove('speaking');
    });

    if (entry.paraIndex === null || entry.paraIndex === undefined) return;
    const para = container.querySelector(`.player-para[data-para="${entry.paraIndex}"]`);
    if (!para) return;

    para.classList.add(entry.lang === 'zh' ? 'zh-active' : 'active');

    let target = para;
    const spans = para.querySelectorAll('.player-sentence');
    const spanByText = (text) => {
      const t = (text || '').trim();
      return t ? Array.from(spans).find(s => s.textContent.trim() === t) : null;
    };
    if (entry.lang === 'en' && entry.sentences) {
      let span = null;
      if (sentIdx >= 0 && spans.length === entry.sentences.length && spans[sentIdx]) {
        // Segment covers the whole paragraph — indices align
        span = spans[sentIdx];
      } else if (entry.sentences.length === 1) {
        // Sentence-repeat mode: the segment is one sentence — find it by text
        span = spanByText(entry.sentences[0].text);
      }
      if (span) {
        span.classList.add('speaking');
        target = span;
      }
    } else if (entry.lang === 'zh' && entry.srcSentence) {
      // Chinese translation of one sentence — keep that sentence highlighted
      const span = spanByText(entry.srcSentence);
      if (span) {
        span.classList.add('speaking');
        target = span;
      }
    }

    if (this._viewMode === 'subtitle') {
      const subtitleSpan = target.classList.contains('player-sentence')
        ? target
        : target.querySelector('.player-sentence');
      this._updateSubtitleView(subtitleSpan);
    } else {
      this._autoScrollTo(target);
    }
  }

  _autoScrollTo(el) {
    if (Date.now() - this._lastManualScroll < 3000) return;
    this._autoScrolling = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => { this._autoScrolling = false; }, 700);
  }

  // ── Subtitle view (current sentence ± neighbors, large type) ──

  _toggleViewMode() {
    this._viewMode = this._viewMode === 'subtitle' ? 'full' : 'subtitle';
    localStorage.setItem(VIEW_MODE_KEY, this._viewMode);
    this._applyViewMode();
  }

  _applyViewMode() {
    const isSubtitle = this._viewMode === 'subtitle';
    this.el.screen.classList.toggle('subtitle-mode', isSubtitle);
    this.el.btnMode.classList.toggle('active', isSubtitle);
    this.el.btnMode.setAttribute('aria-pressed', String(isSubtitle));
    if (isSubtitle) {
      const current = this._flatSentences[this._activeFlatIndex()] || this._flatSentences[0] || null;
      this._updateSubtitleView(current);
    }
  }

  /** Index into _flatSentences of the currently-speaking sentence, or -1. */
  _activeFlatIndex() {
    const speaking = this.el.text.querySelector('.player-sentence.speaking');
    return speaking && speaking.dataset.flatIndex !== undefined ? parseInt(speaking.dataset.flatIndex, 10) : -1;
  }

  /**
   * Show the current sentence plus its neighbors, ignoring paragraph
   * boundaries so the reading flow stays continuous across paragraph breaks.
   */
  _updateSubtitleView(currentSpan) {
    const { subtitlePrev, subtitleCurrent, subtitleNext } = this.el;
    if (!currentSpan) {
      subtitlePrev.textContent = '';
      subtitleCurrent.textContent = '';
      subtitleNext.textContent = '';
      return;
    }
    const idx = currentSpan.dataset.flatIndex !== undefined ? parseInt(currentSpan.dataset.flatIndex, 10) : -1;
    const prev = idx > 0 ? this._flatSentences[idx - 1] : null;
    const next = idx >= 0 && idx < this._flatSentences.length - 1 ? this._flatSentences[idx + 1] : null;
    subtitlePrev.textContent = prev ? prev.textContent : '';
    subtitleCurrent.textContent = currentSpan.textContent;
    subtitleNext.textContent = next ? next.textContent : '';
  }

  // ── Progress persistence ──

  _saveProgressIfOpen() {
    if (this.chapterIndex !== null) this._saveProgress(true);
  }

  _saveProgress(force = false) {
    if (this.chapterIndex === null) return;
    if (!force && Date.now() - this._lastSave < PROGRESS_SAVE_INTERVAL_MS) return;
    this._lastSave = Date.now();
    this.onSaveProgress({
      chapterIndex: this.chapterIndex,
      time: this.audio.currentTime || 0,
      duration: this.audio.duration || 0,
    });
  }

  // ── Media Session (lock screen / notification controls) ──

  _setMediaSessionMetadata(bookTitle, chapterTitle) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapterTitle,
        artist: bookTitle,
        album: 'Audiobook',
      });
      navigator.mediaSession.setActionHandler('play', () => this.audio.play());
      navigator.mediaSession.setActionHandler('pause', () => this.audio.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => this.seekBy(-15));
      navigator.mediaSession.setActionHandler('seekforward', () => this.seekBy(15));
      navigator.mediaSession.setActionHandler('previoustrack', () => this.onRequestChapter(-1));
      navigator.mediaSession.setActionHandler('nexttrack', () => this.onRequestChapter(1));
    } catch { /* older browsers */ }
  }

  _updateMediaSession(state) {
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = state; } catch { /* ignore */ }
    }
  }

  _cleanupUrl() {
    if (this._url) {
      URL.revokeObjectURL(this._url);
      this._url = null;
    }
  }
}
