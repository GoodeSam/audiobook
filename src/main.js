/**
 * EPUB to Audiobook - Main application.
 *
 * Orchestrates upload, parsing, markdown conversion, translation, and TTS.
 */

import { parseEPUB } from './epub-parser.js';
import { parsePDF } from './pdf-parser.js';
import { parseDOCX } from './docx-parser.js';
import { parseDOC } from './doc-parser.js';
import { parseHTML } from './html-parser.js';
import { htmlToMarkdown, cleanMarkdown } from './html-to-markdown.js';
import { isSpeechRecognitionSupported, createSpeechRecognition } from './speech-to-text.js';
import { generateChapterAudio, cancelGeneration, synthesizeText, validateVoiceSettings } from './edge-tts.js';
import { translateChapter, translateTexts, cancelTranslation, resetTranslationState } from './ms-translator.js';
import { sanitizeFilename, exportMultipleChapters, extractImagesFromMarkdown } from './chapter-export.js';
import { ProgressTracker } from './progress-tracker.js';
import { buildBilingualMarkdown } from './bilingual-view.js';
import { createAppState, resetStateForNewBook, resetStateOnError } from './app-state.js';
import { countTranslatableParagraphs } from './paragraph-utils.js';
import { Player } from './player.js';
import { formatTime } from './audio-timeline.js';
import {
  listUsers, createUser,
  saveBook, getBook, listBooks, deleteBook,
  saveChapterAudio, getBookAudio,
  saveProgress, getProgress, getLastPlayed,
  getCachedTranslation, putCachedTranslation,
} from './db.js';
import { autoSplitChapters } from './content-splitter.js';
import { fetchCatalog, fetchRemoteBook, fetchRemoteAudio, visibleBooks, isKnownCode } from './remote-library.js';
import { buildPublishZip, countAudioChapters } from './publish-export.js';
import {
  normalizeAccessInput, accessToInput,
  getSavedToken, saveToken, clearToken,
  uploadPublishZip, setBookAccess, setValidCodes,
  deleteBook as apiDeleteBook, makePublishId,
} from './library-api.js';

// ── State ──

const state = createAppState();

// ── DOM elements ──

const $ = (id) => document.getElementById(id);

const uploadScreen = $('upload-screen');
const readerScreen = $('reader-screen');
const dropZone = $('drop-zone');
const btnBack = $('btn-back');
const bookTitleEl = $('book-title');
const voiceEnSelect = $('voice-en-select');
const voiceZhSelect = $('voice-zh-select');
const speedEnRange = $('speed-en-range');
const speedZhRange = $('speed-zh-range');
const speedEnLabel = $('speed-en-label');
const speedZhLabel = $('speed-zh-label');
const audioModeSelect = $('audio-mode-select');
const translateLangSelect = $('translate-lang-select');
const chapterList = $('chapter-list');
const contentPlaceholder = $('content-placeholder');
const chapterView = $('chapter-view');
const chapterTitle = $('chapter-title');
const chapterMarkdown = $('chapter-markdown');
const btnTranslateChapter = $('btn-translate-chapter');
const btnGenerateChapter = $('btn-generate-chapter');
const btnDownloadChapter = $('btn-download-chapter');
const btnDownloadMd = $('btn-download-md');
const btnSelectAll = $('btn-select-all');
const btnTranslateSelected = $('btn-translate-selected');
const btnGenerateSelected = $('btn-generate-selected');
const btnExportSelected = $('btn-export-selected');
const btnDownloadAll = $('btn-download-all');
const progressOverlay = $('progress-overlay');
const progressTitle = $('progress-title');
const progressBar = $('progress-bar');
const progressPercent = $('progress-percent');
const progressText = $('progress-text');
const btnCancel = $('btn-cancel');
const settingsPanel = $('settings-panel');
const btnToggleSettings = $('btn-toggle-settings');
const summaryMode = $('summary-mode');
const summaryLang = $('summary-lang');
const statusTranslation = $('status-translation');
const statusAudio = $('status-audio');
const statusCheckpoint = $('status-checkpoint');
const toastContainer = $('toast-container');
const btnListenChapter = $('btn-listen-chapter');
const userSelect = $('user-select');
const btnAddUser = $('btn-add-user');
const userAddRow = $('user-add-row');
const userNameInput = $('user-name-input');
const btnUserSave = $('btn-user-save');
const btnUserCancel = $('btn-user-cancel');
const librarySection = $('library-section');
const libraryList = $('library-list');
const playerScreen = $('player-screen');
const loginCard = $('login-card');
const accessCodeInput = $('access-code-input');
const btnLogin = $('btn-login');
const loginError = $('login-error');
const shelfSection = $('shelf-section');
const shelfList = $('shelf-list');
const shelfEmpty = $('shelf-empty');
const shelfCodeLabel = $('shelf-code-label');
const btnLogout = $('btn-logout');
const btnCopyWechat = $('btn-copy-wechat');
const btnExportPublish = $('btn-export-publish');
const btnPublishSite = $('btn-publish-site');
const publishModal = $('publish-modal');
const publishModalInfo = $('publish-modal-info');
const publishAccessInput = $('publish-access-input');
const publishTokenInput = $('publish-token-input');
const publishProgressRow = $('publish-progress-row');
const publishProgressBar = $('publish-progress-bar');
const publishProgressPercent = $('publish-progress-percent');
const publishModalStatus = $('publish-modal-status');
const publishForm = $('publish-form');
const publishResult = $('publish-result');
const btnPublishCancel = $('btn-publish-cancel');
const btnPublishConfirm = $('btn-publish-confirm');
const fieldModal = $('field-modal');
const fieldModalTitle = $('field-modal-title');
const fieldModalHint = $('field-modal-hint');
const fieldModalInput = $('field-modal-input');
const fieldModalTokenRow = $('field-modal-token-row');
const fieldModalToken = $('field-modal-token');
const fieldModalStatus = $('field-modal-status');
const btnFieldCancel = $('btn-field-cancel');
const btnFieldSave = $('btn-field-save');
const shelfAdminTools = $('shelf-admin-tools');
const validCodesLabel = $('valid-codes-label');
const btnManageCodes = $('btn-manage-codes');

// ── App mode: user (default) vs admin ──
// Admin mode is for the operator who generates audio; users only listen.
// Toggle by visiting the app with #admin (persists) or #user to switch back.

const ADMIN_KEY = 'audiobook.adminMode';
let adminMode = localStorage.getItem(ADMIN_KEY) === '1';

function applyModeFromHash() {
  if (location.hash === '#admin') adminMode = true;
  else if (location.hash === '#user') adminMode = false;
  localStorage.setItem(ADMIN_KEY, adminMode ? '1' : '0');
  document.body.classList.toggle('admin-mode', adminMode);
  document.body.classList.toggle('user-mode', !adminMode);
}
applyModeFromHash();
window.addEventListener('hashchange', () => {
  const wasAdmin = adminMode;
  applyModeFromHash();
  if (wasAdmin !== adminMode) initHome();
});

// ── Upload handling ──

const DROP_ZONE_DEFAULT = `
  <div class="drop-icon">📖</div>
  <p>Drag & drop an EPUB, PDF, DOC, DOCX, or HTML file here</p>
  <p class="or">or</p>
  <label class="file-btn">Choose File<input type="file" accept=".epub,.pdf,.doc,.docx,.html,.htm" hidden></label>
`;

function resetDropZone(errorMsg) {
  if (errorMsg) {
    const safe = errorMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    dropZone.innerHTML = `
      <div class="drop-icon">📖</div>
      <p style="color: var(--danger)">Error: ${safe}</p>
      <p class="or">Try another file</p>
      <label class="file-btn">Choose File<input type="file" accept=".epub,.pdf,.doc,.docx,.html,.htm" hidden></label>
    `;
  } else {
    dropZone.innerHTML = DROP_ZONE_DEFAULT;
  }
}

function getFileInput() {
  return dropZone.querySelector('input[type="file"]');
}

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  const name = file?.name.toLowerCase() || '';
  if (name.endsWith('.epub') || name.endsWith('.pdf') || name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.html') || name.endsWith('.htm')) handleFile(file);
});

// Use event delegation so it works after innerHTML replacements.
// Reset the input value after handling so the same file can be re-selected.
dropZone.addEventListener('change', (e) => {
  if (e.target.type === 'file' && e.target.files[0]) {
    const file = e.target.files[0];
    e.target.value = '';
    handleFile(file);
  }
});
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const input = getFileInput();
    if (input) input.click();
  }
});
dropZone.addEventListener('click', (e) => {
  // Don't interfere with the file input or its wrapping label — the native
  // label-input association already opens the picker. Calling input.click()
  // on top of that would double-fire, causing the picker to open then
  // immediately close on some browsers, requiring a second attempt.
  if (e.target.closest('label') || e.target.tagName === 'INPUT') return;
  const input = getFileInput();
  if (input) input.click();
});

async function handleFile(file) {
  if (state.working) return; // Prevent concurrent uploads
  state.working = true;

  try {
    // Cancel any in-flight operations from a previous session
    cancelGeneration();
    cancelTranslation();
    hideProgress();

    const ext = file.name.toLowerCase().split('.').pop();
    const formatName = { pdf: 'PDF', epub: 'EPUB', doc: 'DOC', docx: 'DOCX', html: 'HTML', htm: 'HTML' }[ext] || 'file';
    dropZone.innerHTML = `<p>Parsing ${formatName}...</p>`;

    let book;
    if (ext === 'pdf') {
      book = await parsePDF(file);
      for (const ch of book.chapters) {
        ch.markdown = cleanMarkdown(ch.markdown);
        ch.translatedMarkdown = null;
      }
    } else if (ext === 'doc') {
      book = await parseDOC(file);
      for (const ch of book.chapters) {
        ch.markdown = cleanMarkdown(ch.markdown);
        ch.translatedMarkdown = null;
      }
    } else if (ext === 'docx') {
      book = await parseDOCX(file);
      for (const ch of book.chapters) {
        ch.markdown = cleanMarkdown(ch.markdown);
        ch.translatedMarkdown = null;
      }
    } else if (ext === 'html' || ext === 'htm') {
      book = await parseHTML(file);
      for (const ch of book.chapters) {
        ch.markdown = cleanMarkdown(ch.markdown);
        ch.translatedMarkdown = null;
      }
    } else {
      book = await parseEPUB(file);
      for (const ch of book.chapters) {
        ch.markdown = cleanMarkdown(htmlToMarkdown(ch.html));
        ch.translatedMarkdown = null;
        delete ch.html;
      }
    }

    // Books without usable chapter structure parse as a few huge chapters —
    // split them into balanced parts so translation, audio generation, and
    // per-chapter user downloads stay manageable.
    book.chapters = autoSplitChapters(book.chapters);

    // Merge previously saved translations for the same book (re-upload case)
    const bookId = makeBookId(book.title);
    try {
      const stored = await getBook(bookId);
      if (stored && stored.chapters?.length === book.chapters.length) {
        stored.chapters.forEach((sc, i) => {
          if (sc.translatedMarkdown) book.chapters[i].translatedMarkdown = sc.translatedMarkdown;
        });
      }
    } catch { /* persistence unavailable — continue in-memory */ }

    // Reset all state flags (including generating and working)
    resetStateForNewBook(state, book);
    state.bookId = bookId;
    _renderCache.clear();
    _previewCache.clear();

    // Restore previously generated audio for this book
    await restoreBookAudio(bookId);
    persistBook();

    // Restore drop zone before switching screens so it's ready if user comes back
    resetDropZone();
    showReaderScreen();
  } catch (err) {
    resetStateOnError(state);
    resetDropZone(err.message);
  }
}

// ── Screen navigation ──

function showReaderScreen() {
  uploadScreen.classList.remove('active');
  readerScreen.classList.add('active');
  bookTitleEl.textContent = state.book.title;
  renderChapterList();
  showPlaceholder();
  refreshPublishIndicator();
  refreshPublishedMap().then(refreshPublishIndicator);
}

btnBack.addEventListener('click', () => {
  cancelGeneration();
  cancelTranslation();
  state.generating = false;
  hideProgress();
  _renderCache.clear();

  readerScreen.classList.remove('active');
  uploadScreen.classList.add('active');
  resetDropZone();
  initHome();
});

// ── Settings toggle & config summary ──

btnToggleSettings.addEventListener('click', () => {
  settingsPanel.classList.toggle('collapsed');
  btnToggleSettings.textContent = settingsPanel.classList.contains('collapsed') ? 'Settings ▸' : 'Settings ▾';
});

function updateConfigSummary() {
  const modeLabels = {
    original: 'Original', translated: 'Translated', bilingual: 'Bilingual',
    'en-zh-en': 'EN→ZH→EN', 'en-zh-en-sentence': 'EN→ZH→EN 逐句',
  };
  summaryMode.textContent = modeLabels[audioModeSelect.value] || 'Bilingual';
  const langEl = translateLangSelect.selectedOptions[0];
  summaryLang.textContent = '→ ' + (langEl ? langEl.textContent : 'Chinese');
}

audioModeSelect.addEventListener('change', updateConfigSummary);
translateLangSelect.addEventListener('change', updateConfigSummary);
updateConfigSummary();

// ── Toast notification system (replaces alert) ──

function showToast(message, type = 'info', duration = 5000) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = message;

  const copyBtn = document.createElement('button');
  copyBtn.className = 'toast-copy';
  copyBtn.textContent = 'Copy';
  copyBtn.title = 'Copy message';
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(message).then(() => {
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
  });

  toast.appendChild(text);
  toast.appendChild(copyBtn);
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Chapter status bar ──

function updateChapterStatusBar(idx) {
  const ch = state.book.chapters[idx];
  const hasTr = !!ch.translatedMarkdown;
  const hasAudio = !!state.audioBlobs[idx];
  const hasTrCp = !!state.translationCheckpoints[idx];
  const hasAuCp = !!state.audioCheckpoints[idx];

  if (hasTr && !hasTrCp) {
    statusTranslation.textContent = 'Translated';
    statusTranslation.className = 'status-badge status-done';
  } else if (hasTrCp) {
    const cp = state.translationCheckpoints[idx];
    statusTranslation.textContent = `Translating ${cp.completedIndex}/${cp.totalParagraphs}`;
    statusTranslation.className = 'status-badge status-partial';
  } else {
    statusTranslation.textContent = 'Not translated';
    statusTranslation.className = 'status-badge status-pending';
  }

  if (hasAudio && !hasAuCp) {
    statusAudio.textContent = 'Audio ready';
    statusAudio.className = 'status-badge status-done';
  } else if (hasAuCp) {
    const cp = state.audioCheckpoints[idx];
    statusAudio.textContent = `Audio ${cp.completedIndex}/${cp.totalSegments}`;
    statusAudio.className = 'status-badge status-partial';
  } else {
    statusAudio.textContent = 'No audio';
    statusAudio.className = 'status-badge status-pending';
  }
}

// ── Speed controls ──

function updateSpeedLabel(range, label) {
  const v = parseInt(range.value);
  label.textContent = `${v >= 0 ? '+' : ''}${v}%`;
}

speedEnRange.addEventListener('input', () => updateSpeedLabel(speedEnRange, speedEnLabel));
speedZhRange.addEventListener('input', () => updateSpeedLabel(speedZhRange, speedZhLabel));

// +/- buttons: adjust speed by 5% per click, clamped to range min/max
document.querySelectorAll('.speed-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const range = $(btn.dataset.target);
    if (!range) return;
    const delta = parseInt(btn.dataset.delta);
    const min = parseInt(range.min);
    const max = parseInt(range.max);
    range.value = Math.max(min, Math.min(max, parseInt(range.value) + delta));
    range.dispatchEvent(new Event('input'));
  });
});

// ── Voice preview ──

const PREVIEW_SAMPLES = {
  en: 'The quick brown fox jumps over the lazy dog. Every great journey begins with a single step.',
  zh: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。',
};

const btnPreviewEn = $('btn-preview-en');
const btnPreviewZh = $('btn-preview-zh');
let _previewAudio = null;
let _previewUrl = null;

function cleanupPreview() {
  if (_previewAudio) {
    _previewAudio.pause();
    _previewAudio.onended = null;
    _previewAudio = null;
  }
  if (_previewUrl) {
    URL.revokeObjectURL(_previewUrl);
    _previewUrl = null;
  }
}

let _previewPlaying = false;
let _previewBtn = null;
const _previewCache = new Map(); // key: `${voice}:${speechRate}:${sampleKey}` → Blob
const PREVIEW_CACHE_MAX = 10;

async function previewVoice(voice, speechRate, sampleKey, btn) {
  // Don't preview while generation is active — they share the global WebSocket
  if (state.generating) return;

  if (_previewPlaying && _previewBtn === btn) {
    stopPreview(btn);
    return;
  }
  if (_previewBtn && _previewBtn !== btn) stopPreview(_previewBtn);
  cleanupPreview();

  btn.disabled = true;
  btn.textContent = '...';
  _previewBtn = btn;

  try {
    const cacheKey = `${voice}:${speechRate}:${sampleKey}`;
    let blob = _previewCache.get(cacheKey);
    if (!blob) {
      blob = await synthesizeText(PREVIEW_SAMPLES[sampleKey], { voice, speechRate });
      if (_previewCache.size >= PREVIEW_CACHE_MAX) {
        // Evict oldest entry
        const oldest = _previewCache.keys().next().value;
        _previewCache.delete(oldest);
      }
      _previewCache.set(cacheKey, blob);
    }
    _previewUrl = URL.createObjectURL(blob);
    _previewAudio = new Audio(_previewUrl);
    _previewPlaying = true;
    _previewAudio.onended = () => stopPreview(btn);
    btn.textContent = '\u25A0';
    btn.disabled = false;
    _previewAudio.play();
  } catch (err) {
    cleanupPreview();
    _previewPlaying = false;
    _previewBtn = null;
    btn.textContent = '\u25B6';
    btn.disabled = false;
    btn.title = `Preview failed: ${err.message || 'unknown error'}`;
    console.warn('Voice preview failed:', err);
  }
}

function stopPreview(btn) {
  cleanupPreview();
  _previewPlaying = false;
  _previewBtn = null;
  if (btn) {
    btn.textContent = '\u25B6';
    btn.disabled = false;
  }
}

btnPreviewEn.addEventListener('click', () => {
  previewVoice(voiceEnSelect.value, parseInt(speedEnRange.value), 'en', btnPreviewEn);
});

btnPreviewZh.addEventListener('click', () => {
  previewVoice(voiceZhSelect.value, parseInt(speedZhRange.value), 'zh', btnPreviewZh);
});

// ── Chapter list ──

let _lastCheckedIdx = null; // For Shift+click range selection

function renderChapterList() {
  // Full rebuild only if chapter count changed (new book)
  if (chapterList.children.length !== state.book.chapters.length) {
    chapterList.innerHTML = '';
    state.book.chapters.forEach((ch, idx) => {
      const li = document.createElement('li');
      li.className = 'chapter-item';
      li.dataset.index = idx;
      li.tabIndex = 0;
      li.setAttribute('role', 'option');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'chapter-cb';

      const icons = document.createElement('span');
      icons.className = 'status-icons';

      const name = document.createElement('span');
      name.className = 'chapter-name';
      name.textContent = ch.title;
      name.title = ch.title;

      li.appendChild(cb);
      li.appendChild(icons);
      li.appendChild(name);
      chapterList.appendChild(li);
    });
  }

  // Patch each row's state without rebuilding DOM
  for (let idx = 0; idx < state.book.chapters.length; idx++) {
    const li = chapterList.children[idx];
    const ch = state.book.chapters[idx];
    const cb = li.querySelector('.chapter-cb');
    const icons = li.querySelector('.status-icons');

    li.classList.toggle('active', idx === state.activeChapter);
    li.setAttribute('aria-selected', idx === state.activeChapter ? 'true' : 'false');
    cb.checked = state.selectedChapters.has(idx);

    const hasTrCp = !!state.translationCheckpoints[idx];
    const hasAuCp = !!state.audioCheckpoints[idx];
    icons.innerHTML = buildStatusLabel(ch, idx);
  }
  updateBulkButtons();
}

/** Update a single chapter row without touching other rows. */
function updateChapterRow(idx) {
  const li = chapterList.children[idx];
  if (!li) return;
  const ch = state.book.chapters[idx];
  const icons = li.querySelector('.status-icons');
  icons.innerHTML = buildStatusLabel(ch, idx);
}

/** Build status label HTML for a chapter row. */
function buildStatusLabel(ch, idx) {
  const hasAudio = !!state.audioBlobs[idx] || !!state.remoteAudioMeta[idx];

  // User mode: show listenability + per-chapter download state
  if (!adminMode) {
    if (state.audioBlobs[idx]) {
      return '<span class="row-status row-status-done" role="img" aria-label="Downloaded">✓ 已下载</span>';
    }
    if (state.remoteAudioMeta[idx]) {
      const size = state.remoteAudioMeta[idx].size;
      const sizeLabel = size ? ` ${(size / 1048576).toFixed(1)}MB` : '';
      return `<span class="row-status row-status-cloud" role="img" aria-label="Tap to download">☁️ 可听${sizeLabel}</span>`;
    }
    return '<span class="row-status row-status-pending" role="img" aria-label="Text only">文本</span>';
  }

  const hasTrCp = !!state.translationCheckpoints[idx];
  const hasAuCp = !!state.audioCheckpoints[idx];
  const hasTr = !!ch.translatedMarkdown;

  if (hasTrCp) return '<span class="row-status row-status-partial" role="img" aria-label="Translation in progress">Translating...</span>';
  if (hasAuCp) return '<span class="row-status row-status-partial" role="img" aria-label="Audio in progress">Generating...</span>';
  if (hasTr && hasAudio) return '<span class="row-status row-status-done" role="img" aria-label="Complete">Ready</span>';
  if (hasTr) return '<span class="row-status row-status-done" role="img" aria-label="Translated">Translated</span>';
  return '<span class="row-status row-status-pending" role="img" aria-label="Not processed">Pending</span>';
}

// Event delegation for chapter list — avoids per-row listeners
chapterList.addEventListener('click', (e) => {
  const li = e.target.closest('.chapter-item');
  if (!li) return;
  const idx = parseInt(li.dataset.index);
  if (e.target.classList.contains('chapter-cb')) {
    e.stopPropagation();
    handleCheckboxClick(idx, e.target.checked, e.shiftKey);
  } else {
    selectChapter(idx);
  }
});
chapterList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const li = e.target.closest('.chapter-item');
  if (!li) return;
  e.preventDefault();
  selectChapter(parseInt(li.dataset.index));
});

function handleCheckboxClick(idx, checked, shiftKey) {
  if (shiftKey && _lastCheckedIdx !== null) {
    // Range select: toggle all between last checked and current
    const from = Math.min(_lastCheckedIdx, idx);
    const to = Math.max(_lastCheckedIdx, idx);
    for (let i = from; i <= to; i++) {
      if (checked) state.selectedChapters.add(i);
      else state.selectedChapters.delete(i);
    }
    renderChapterList(); // Re-render to update all checkboxes
  } else {
    if (checked) state.selectedChapters.add(idx);
    else state.selectedChapters.delete(idx);
  }
  _lastCheckedIdx = idx;
}

function selectChapter(idx) {
  state.activeChapter = idx;
  const ch = state.book.chapters[idx];

  for (const item of chapterList.children) {
    item.classList.toggle('active', parseInt(item.dataset.index) === idx);
  }

  contentPlaceholder.hidden = true;
  contentPlaceholder.classList.remove('visible');
  chapterView.hidden = false;
  chapterView.classList.add('visible');
  chapterTitle.textContent = ch.title;

  // Update tabs
  updateTabs();
  showTab(state.activeTab);
  updateChapterButtons(idx);
  updateChapterStatusBar(idx);
}

/**
 * Update chapter action button states based on completed operations.
 */
function updateChapterButtons(idx) {
  const ch = state.book.chapters[idx];
  const hasTranslation = !!ch.translatedMarkdown;
  const hasAudio = !!state.audioBlobs[idx];
  const hasTranslationCp = !!state.translationCheckpoints[idx];
  const hasAudioCp = !!state.audioCheckpoints[idx];

  // Translate button
  if (hasTranslation && !hasTranslationCp) {
    btnTranslateChapter.textContent = 'Translated \u2713';
    btnTranslateChapter.classList.add('done');
    btnTranslateChapter.classList.remove('resume');
  } else if (hasTranslationCp) {
    const cp = state.translationCheckpoints[idx];
    btnTranslateChapter.textContent = `Resume (${cp.completedIndex}/${cp.totalParagraphs})`;
    btnTranslateChapter.classList.remove('done');
    btnTranslateChapter.classList.add('resume');
  } else {
    btnTranslateChapter.textContent = 'Translate';
    btnTranslateChapter.classList.remove('done', 'resume');
  }

  // Generate MP3 button
  if (hasAudio && !hasAudioCp) {
    btnGenerateChapter.textContent = 'MP3 Ready \u2713';
    btnGenerateChapter.classList.add('done');
    btnGenerateChapter.classList.remove('resume');
  } else if (hasAudioCp) {
    const cp = state.audioCheckpoints[idx];
    btnGenerateChapter.textContent = `Resume (${cp.completedIndex}/${cp.totalSegments})`;
    btnGenerateChapter.classList.remove('done');
    btnGenerateChapter.classList.add('resume');
  } else {
    btnGenerateChapter.textContent = 'Generate MP3';
    btnGenerateChapter.classList.remove('done', 'resume');
  }

  // Listen + download buttons (remote audio can be fetched on demand)
  btnListenChapter.disabled = !hasAudio && !state.remoteAudioMeta[idx];
  btnDownloadChapter.disabled = !hasAudio;
}

function showPlaceholder() {
  contentPlaceholder.hidden = false;
  contentPlaceholder.classList.add('visible');
  chapterView.hidden = true;
  chapterView.classList.remove('visible');
}

// ── Tabs ──

function updateTabs() {
  const ch = state.book.chapters[state.activeChapter];
  const hasTranslation = !!ch?.translatedMarkdown;
  document.querySelector('.tab-btn[data-tab="translated"]').classList.toggle('has-content', hasTranslation);
  document.querySelector('.tab-btn[data-tab="bilingual"]').classList.toggle('has-content', hasTranslation);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    showTab(btn.dataset.tab);
  });
});

// Render cache: avoids re-rendering markdown on tab switches
const _renderCache = new Map(); // key: `${chapterIndex}:${tab}` → html string

function invalidateRenderCache(idx) {
  for (const key of _renderCache.keys()) {
    if (key.startsWith(`${idx}:`)) _renderCache.delete(key);
  }
}

function getCachedRender(idx, tab, renderFn) {
  const key = `${idx}:${tab}`;
  if (!_renderCache.has(key)) {
    _renderCache.set(key, renderFn());
  }
  return _renderCache.get(key);
}

function showTab(tab) {
  const idx = state.activeChapter;
  const ch = state.book.chapters[idx];
  if (!ch) return;

  const notTranslatedMsg = '<p style="color: var(--muted)">Not yet translated. Click "Translate" to translate this chapter.</p>';

  if (tab === 'translated' && ch.translatedMarkdown) {
    chapterMarkdown.innerHTML = getCachedRender(idx, 'translated', () => renderMarkdownHtml(ch.translatedMarkdown));
  } else if (tab === 'translated') {
    chapterMarkdown.innerHTML = notTranslatedMsg;
  } else if (tab === 'bilingual' && ch.translatedMarkdown) {
    chapterMarkdown.innerHTML = getCachedRender(idx, 'bilingual', () => {
      const bilingual = buildBilingualMarkdown(ch.markdown, ch.translatedMarkdown);
      return renderMarkdownHtml(bilingual);
    });
  } else if (tab === 'bilingual') {
    chapterMarkdown.innerHTML = notTranslatedMsg;
  } else {
    chapterMarkdown.innerHTML = getCachedRender(idx, 'original', () => renderMarkdownHtml(ch.markdown));
  }
}

// ── Select All ──

btnSelectAll.addEventListener('click', () => {
  const allSelected = state.selectedChapters.size === state.book.chapters.length;
  state.selectedChapters = allSelected ? new Set() : new Set(state.book.chapters.map((_, i) => i));
  renderChapterList();
});

// ── Translation ──

btnTranslateChapter.addEventListener('click', async () => {
  if (state.activeChapter === null || state.generating) return;
  // Skip if already fully translated (no checkpoint means complete)
  const ch = state.book.chapters[state.activeChapter];
  if (ch.translatedMarkdown && !state.translationCheckpoints[state.activeChapter]) return;
  await translateSingleChapter(state.activeChapter);
});

btnTranslateSelected.addEventListener('click', async () => {
  if (state.generating || state.selectedChapters.size === 0) return;
  await translateMultipleChapters([...state.selectedChapters].sort((a, b) => a - b));
});

async function translateSingleChapter(idx) {
  const ch = state.book.chapters[idx];
  const toLang = translateLangSelect.value;
  const fromLang = detectSourceLang();
  state.generating = true;

  // Resume from checkpoint if available
  const cp = state.translationCheckpoints[idx];
  const resuming = cp && cp.completedIndex > 0;
  showProgress(resuming
    ? `Resuming translation: ${ch.title} (from ${cp.completedIndex})`
    : `Translating: ${ch.title}`);

  try {
    resetTranslationState();
    const translated = await translateChapter(ch.markdown, fromLang, toLang, {
      startIndex: cp ? cp.completedIndex : 0,
      existingTranslations: cp ? cp.translatedParagraphs : [],
      onProgress: (current, total) => updateProgress(current, total, `Translating: ${current} / ${total} paragraphs`),
      onStatus: (msg) => { progressText.textContent = msg; },
      onCheckpoint: (cpData) => { state.translationCheckpoints[idx] = cpData; },
    });
    ch.translatedMarkdown = translated;
    delete state.translationCheckpoints[idx];
    persistBook();
    invalidateRenderCache(idx); // Translation changed — clear cached renders
    renderChapterList();
    updateTabs();
    showTab(state.activeTab);
    if (state.activeChapter === idx) updateChapterButtons(idx);
  } catch (err) {
    // Checkpoint is preserved in state.translationCheckpoints[idx] for resume
    if (!err.message.includes('cancelled')) {
      showToast('Translation error: ' + err.message, 'error');
    }
  } finally {
    state.generating = false;
    hideProgress();
  }
}

async function translateMultipleChapters(indices) {
  state.generating = true;
  const toLang = translateLangSelect.value;
  const fromLang = detectSourceLang();
  const toTranslate = indices.filter(i =>
    !state.book.chapters[i].translatedMarkdown || state.translationCheckpoints[i]
  );

  const tracker = new ProgressTracker([{ name: 'translating', weight: 1.0 }]);
  tracker.onProgress((s) => {
    setProgressPercent(s.overallPercent);
    progressText.textContent = tracker.statusText;
  });

  showProgress('Translating chapters...');

  try {
    let totalParas = 0;
    for (const idx of toTranslate) {
      totalParas += countTranslatableParagraphs(state.book.chapters[idx].markdown);
    }
    tracker.startPhase('translating', totalParas);
    let completedParas = 0;

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const ch = state.book.chapters[idx];

      if (ch.translatedMarkdown && !state.translationCheckpoints[idx]) continue;

      const tcp = state.translationCheckpoints[idx];
      progressTitle.textContent = `Translating ${i + 1}/${indices.length}: ${ch.title}${tcp ? ' (resuming)' : ''}`;
      resetTranslationState();

      const translated = await translateChapter(ch.markdown, fromLang, toLang, {
        startIndex: tcp ? tcp.completedIndex : 0,
        existingTranslations: tcp ? tcp.translatedParagraphs : [],
        onProgress: (current) => {
          tracker.advance(completedParas + current);
        },
        onStatus: (msg) => { progressText.textContent = msg; },
        onCheckpoint: (cpData) => { state.translationCheckpoints[idx] = cpData; },
      });

      completedParas += countTranslatableParagraphs(ch.markdown);
      ch.translatedMarkdown = translated;
      delete state.translationCheckpoints[idx];
      persistBook();
      invalidateRenderCache(idx);
      updateChapterRow(idx);
    }
  } catch (err) {
    if (!err.message.includes('cancelled')) {
      showToast('Translation error: ' + err.message, 'error');
    }
  } finally {
    state.generating = false;
    hideProgress();
    if (state.activeChapter !== null) {
      updateTabs();
      showTab(state.activeTab);
    }
  }
}

function detectSourceLang() {
  return 'auto'; // Let Microsoft auto-detect the source language
}

/**
 * Per-sentence translator used by the en-zh-en-sentence audio mode.
 * Backed by a persistent cache so regenerating audio for the same content
 * never re-hits the rate-limited translation API.
 */
function sentenceModeTranslator() {
  const from = detectSourceLang();
  const to = translateLangSelect.value;
  const keyFor = (text) => `${from}|${to}|${text}`;
  return async (texts) => {
    const cached = await Promise.all(
      texts.map(t => getCachedTranslation(keyFor(t)).catch(() => null))
    );
    const missIdx = [];
    cached.forEach((c, i) => { if (c === null) missIdx.push(i); });

    let fresh = [];
    if (missIdx.length > 0) {
      const hits = texts.length - missIdx.length;
      if (hits > 0) progressText.textContent = `翻译缓存命中 ${hits} 句，还需翻译 ${missIdx.length} 句…`;
      fresh = await translateTexts(missIdx.map(i => texts[i]), from, to, {
        onWait: (seconds, attempt) => {
          progressText.textContent = `⏳ 翻译服务限流 (429)，${seconds} 秒后自动重试（第 ${attempt} 次）— 进度不会丢失`;
        },
        onFallback: () => {
          progressText.textContent = '⚡ 微软翻译限流 — 已自动切换 Google 翻译继续';
        },
        onChunk: (done, total) => {
          progressText.textContent = `正在逐句翻译 ${done} / ${total} 句…`;
        },
      });
      missIdx.forEach((idx, j) => {
        putCachedTranslation(keyFor(texts[idx]), fresh[j]).catch(() => {});
      });
    }

    let j = 0;
    return texts.map((_, i) => (cached[i] !== null ? cached[i] : fresh[j++]));
  };
}

// ── Audio generation ──

btnGenerateChapter.addEventListener('click', async () => {
  if (state.activeChapter === null || state.generating) return;
  // Skip if already fully generated (no checkpoint means complete)
  if (state.audioBlobs[state.activeChapter] && !state.audioCheckpoints[state.activeChapter]) return;
  await generateSingleChapter(state.activeChapter);
});

btnGenerateSelected.addEventListener('click', async () => {
  if (state.generating || state.selectedChapters.size === 0) return;
  await generateMultipleChapters([...state.selectedChapters].sort((a, b) => a - b));
});

// ── Translate & Generate combined ──

const btnTranslateGenerate = $('btn-translate-generate');

async function translateAndGenerateSelected() {
  if (state.generating || !state.book) return;
  if (state.selectedChapters.size === 0) {
    // If nothing selected, select all
    state.selectedChapters = new Set(state.book.chapters.map((_, i) => i));
    renderChapterList();
  }
  const indices = [...state.selectedChapters].sort((a, b) => a - b);
  await generateMultipleChapters(indices); // This already translates if needed based on audio mode
}

btnTranslateGenerate.addEventListener('click', () => translateAndGenerateSelected());

async function generateSingleChapter(idx) {
  const ch = state.book.chapters[idx];
  const mode = audioModeSelect.value;

  // Validate voice settings before starting
  const warning = validateVoiceSettings({
    audioMode: mode,
    voiceEn: voiceEnSelect.value,
    voiceZh: voiceZhSelect.value,
    hasTranslation: !!ch.translatedMarkdown,
    targetLang: translateLangSelect.value,
  });
  if (warning) showToast(warning, 'info', 6000);

  // Check if translation is needed
  if ((mode === 'translated' || mode === 'bilingual' || mode === 'en-zh-en') && !ch.translatedMarkdown) {
    await translateSingleChapter(idx);
    if (!ch.translatedMarkdown) return;
  }

  state.generating = true;
  const tracker = new ProgressTracker([{ name: 'generating', weight: 1.0 }]);
  tracker.onProgress((s) => {
    setProgressPercent(s.overallPercent);
    progressText.textContent = s.phase === 'generating'
      ? `Generating: ${s.current} / ${s.total} segments`
      : tracker.statusText;
  });

  // Resume from checkpoint if available
  const acp = state.audioCheckpoints[idx];
  const resumingAudio = acp && acp.completedIndex > 0;
  showProgress(resumingAudio
    ? `Resuming audio: ${ch.title} (from segment ${acp.completedIndex})`
    : `Generating: ${ch.title}`);

  try {
    tracker.startPhase('generating', 1);
    const { blob, timeline } = await generateChapterAudio({
      originalText: ch.markdown,
      translatedText: ch.translatedMarkdown,
      audioMode: mode,
      voiceEn: voiceEnSelect.value,
      voiceZh: voiceZhSelect.value,
      speechRateEn: parseInt(speedEnRange.value),
      speechRateZh: parseInt(speedZhRange.value),
      startIndex: acp ? acp.completedIndex : 0,
      existingBlobs: acp ? acp.audioBlobs : [],
      translateTexts: sentenceModeTranslator(),
      onStatus: (msg) => { progressText.textContent = msg; },
      onProgress: (current, total) => {
        tracker.startPhase('generating', total);
        tracker.advance(current);
      },
      onCheckpoint: (cpData) => { state.audioCheckpoints[idx] = cpData; },
    });

    state.audioBlobs[idx] = blob;
    state.audioTimelines[idx] = timeline;
    state.audioModes[idx] = mode;
    delete state.audioCheckpoints[idx]; // Clear checkpoint on success
    persistAudio(idx);
    renderChapterList();
    selectChapter(idx);
  } catch (err) {
    // Checkpoint is preserved in state.audioCheckpoints[idx] for resume
    if (!err.message.includes('cancelled')) {
      showToast('Audio generation error: ' + err.message, 'error');
    }
  } finally {
    state.generating = false;
    hideProgress();
  }
}

async function generateMultipleChapters(indices) {
  const mode = audioModeSelect.value;
  const total = indices.length;
  const needsTranslation = mode === 'translated' || mode === 'bilingual' || mode === 'en-zh-en';
  const toTranslate = needsTranslation
    ? indices.filter(i => !state.book.chapters[i].translatedMarkdown || state.translationCheckpoints[i])
    : [];
  const toGenerate = indices.filter(i => !state.audioBlobs[i] || state.audioCheckpoints[i]);

  // Build weighted phases
  const phases = [];
  if (toTranslate.length > 0) phases.push({ name: 'translating', weight: 0.3 });
  if (toGenerate.length > 0) phases.push({ name: 'generating', weight: 0.7 });
  if (phases.length === 0) return; // Nothing to do — don't set generating flag
  state.generating = true;
  // If only one phase, give it full weight
  if (phases.length === 1) phases[0].weight = 1.0;

  const tracker = new ProgressTracker(phases);
  tracker.onProgress((s) => {
    setProgressPercent(s.overallPercent);
    progressText.textContent = tracker.statusText;
  });

  showProgress('Processing chapters...');

  const failures = [];

  try {
    // Phase 1: Translate
    if (toTranslate.length > 0) {
      const toLang = translateLangSelect.value;
      const fromLang = detectSourceLang();
      tracker.startPhase('translating', toTranslate.length);

      for (let i = 0; i < toTranslate.length; i++) {
        const idx = toTranslate[i];
        const ch = state.book.chapters[idx];
        const tcp = state.translationCheckpoints[idx];
        progressTitle.textContent = `Translating ${i + 1}/${toTranslate.length}: ${ch.title}${tcp ? ' (resuming)' : ''}`;
        resetTranslationState();

        try {
          const translated = await translateChapter(ch.markdown, fromLang, toLang, {
            startIndex: tcp ? tcp.completedIndex : 0,
            existingTranslations: tcp ? tcp.translatedParagraphs : [],
            onProgress: (current, paraTotal) => {
              tracker.advance(i + current / paraTotal);
            },
            onStatus: (msg) => { progressText.textContent = msg; },
            onCheckpoint: (cpData) => { state.translationCheckpoints[idx] = cpData; },
          });
          ch.translatedMarkdown = translated;
          delete state.translationCheckpoints[idx];
          persistBook();
          invalidateRenderCache(idx);
        } catch (err) {
          if (err.message.includes('cancelled')) throw err;
          failures.push({ chapter: ch.title, phase: 'translate', error: err.message });
        }
        tracker.advance(i + 1);
        updateChapterRow(idx);
      }
    }

    // Phase 2: Generate audio — recompute list to skip chapters with failed translations
    const readyToGenerate = toGenerate.filter(i => {
      const ch = state.book.chapters[i];
      if ((mode === 'translated' || mode === 'bilingual' || mode === 'en-zh-en') && !ch.translatedMarkdown) return false;
      return true;
    });
    if (readyToGenerate.length > 0) {
      tracker.startPhase('generating', readyToGenerate.length);

      for (let i = 0; i < readyToGenerate.length; i++) {
        const idx = readyToGenerate[i];
        const ch = state.book.chapters[idx];
        const acp = state.audioCheckpoints[idx];
        progressTitle.textContent = `Generating ${i + 1}/${readyToGenerate.length}: ${ch.title}${acp ? ' (resuming)' : ''}`;

        try {
          const { blob, timeline } = await generateChapterAudio({
            originalText: ch.markdown,
            translatedText: ch.translatedMarkdown,
            audioMode: mode,
            voiceEn: voiceEnSelect.value,
            voiceZh: voiceZhSelect.value,
            speechRateEn: parseInt(speedEnRange.value),
            speechRateZh: parseInt(speedZhRange.value),
            startIndex: acp ? acp.completedIndex : 0,
            existingBlobs: acp ? acp.audioBlobs : [],
            translateTexts: sentenceModeTranslator(),
            onStatus: (msg) => { progressText.textContent = msg; },
            onProgress: (current, segTotal) => {
              tracker.advance(i + current / segTotal);
            },
            onCheckpoint: (cpData) => { state.audioCheckpoints[idx] = cpData; },
          });
          state.audioBlobs[idx] = blob;
          state.audioTimelines[idx] = timeline;
          state.audioModes[idx] = mode;
          delete state.audioCheckpoints[idx];
          persistAudio(idx);
        } catch (err) {
          if (err.message.includes('cancelled')) throw err;
          failures.push({ chapter: ch.title, phase: 'generate', error: err.message });
        }
        tracker.advance(i + 1);
        updateChapterRow(idx);
      }
    }

    updateBulkButtons();

    if (failures.length > 0) {
      const summary = failures.map(f => `${f.chapter} (${f.phase}): ${f.error}`).join('\n');
      showToast(`${failures.length} chapter(s) had errors`, 'error', 8000);
    }
  } catch (err) {
    if (!err.message.includes('cancelled')) {
      showToast('Error: ' + err.message, 'error');
    }
  } finally {
    state.generating = false;
    hideProgress();
  }
}

// ── Download handlers ──

btnDownloadChapter.addEventListener('click', () => {
  if (state.activeChapter === null) return;
  const blob = state.audioBlobs[state.activeChapter];
  if (!blob) return;
  const ch = state.book.chapters[state.activeChapter];
  downloadBlob(blob, `${sanitizeFilename(ch.title)}.mp3`);
});

btnDownloadMd.addEventListener('click', async () => {
  if (state.activeChapter === null) return;
  const ch = state.book.chapters[state.activeChapter];
  const safeName = sanitizeFilename(ch.title);

  let md, filename;
  if (state.activeTab === 'translated' && ch.translatedMarkdown) {
    md = ch.translatedMarkdown;
    filename = `${safeName}_translated`;
  } else if (state.activeTab === 'bilingual' && ch.translatedMarkdown) {
    md = buildBilingualMarkdown(ch.markdown, ch.translatedMarkdown);
    filename = `${safeName}_bilingual`;
  } else {
    md = ch.markdown;
    filename = safeName;
  }

  const { markdown, images } = extractImagesFromMarkdown(md);

  if (images.length === 0) {
    const blob = new Blob([markdown], { type: 'text/markdown' });
    downloadBlob(blob, `${filename}.md`);
  } else {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    zip.file(`${filename}.md`, markdown);
    for (const img of images) zip.file(`images/${img.filename}`, img.data);
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${filename}.zip`);
  }
});

btnExportSelected.addEventListener('click', async () => {
  try {
    const indices = [...state.selectedChapters].sort((a, b) => a - b);
    if (indices.length === 0) return;

    const hasTranslations = indices.some(i => state.book.chapters[i].translatedMarkdown);
    const files = exportMultipleChapters(state.book.chapters, indices, {
      includeTranslation: hasTranslations,
      includeBilingual: hasTranslations,
    });

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    let hasImages = false;

    for (const f of files) {
      const stem = f.filename.replace(/\.md$/, '');
      const { markdown, images } = extractImagesFromMarkdown(f.content, `images/${stem}`);
      zip.file(f.filename, markdown);
      for (const img of images) {
        zip.file(`images/${stem}/${img.filename}`, img.data);
        hasImages = true;
      }
    }

    if (files.length === 1 && !hasImages) {
      const blob = new Blob([files[0].content], { type: 'text/markdown' });
      downloadBlob(blob, files[0].filename);
      return;
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${sanitizeFilename(state.book.title)}_chapters.zip`);
  } catch (err) {
    showToast('Export failed: ' + err.message, 'error');
  }
});

btnDownloadAll.addEventListener('click', async () => {
  try {
    const blobs = state.audioBlobs;
    if (Object.keys(blobs).length === 0) return;

    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const chapters = state.book.chapters;

    for (let i = 0; i < chapters.length; i++) {
      const prefix = String(i + 1).padStart(3, '0');
      const safeName = sanitizeFilename(chapters[i].title);
      const stem = `${prefix}_${safeName}`;
      if (blobs[i]) zip.file(`${stem}.mp3`, blobs[i]);

      const { markdown: md, images } = extractImagesFromMarkdown(chapters[i].markdown, `images/${stem}`);
      zip.file(`${stem}.md`, md);
      for (const img of images) zip.file(`images/${stem}/${img.filename}`, img.data);

      if (chapters[i].translatedMarkdown) {
        const trans = extractImagesFromMarkdown(chapters[i].translatedMarkdown, `images/${stem}`);
        zip.file(`${stem}_translated.md`, trans.markdown);
        for (const img of trans.images) zip.file(`images/${stem}/${img.filename}`, img.data);

        const bilingual = buildBilingualMarkdown(chapters[i].markdown, chapters[i].translatedMarkdown);
        const bil = extractImagesFromMarkdown(bilingual, `images/${stem}`);
        zip.file(`${stem}_bilingual.md`, bil.markdown);
        for (const img of bil.images) zip.file(`images/${stem}/${img.filename}`, img.data);
      }
    }

    const mp3Blobs = chapters.map((_, i) => blobs[i]).filter(Boolean);
    if (mp3Blobs.length > 1) {
      const arrayBuffers = await Promise.all(mp3Blobs.map(b => b.arrayBuffer()));
      const totalLength = arrayBuffers.reduce((sum, ab) => sum + ab.byteLength, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const ab of arrayBuffers) {
        merged.set(new Uint8Array(ab), offset);
        offset += ab.byteLength;
      }
      zip.file(`${sanitizeFilename(state.book.title)}_complete.mp3`, new Blob([merged], { type: 'audio/mpeg' }));
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, `${sanitizeFilename(state.book.title)}.zip`);
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
});

// ── Progress UI ──

function showProgress(title) {
  progressTitle.textContent = title;
  progressBar.style.width = '0%';
  progressPercent.textContent = '0%';
  progressText.textContent = '';
  progressOverlay.hidden = false;
  progressOverlay.classList.add('visible');
}

function setProgressPercent(pct) {
  const rounded = Math.round(pct);
  progressBar.style.width = `${rounded}%`;
  progressPercent.textContent = `${rounded}%`;
}

function updateProgress(current, total, text) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  setProgressPercent(pct);
  progressText.textContent = text || `${current} / ${total}`;
}

function hideProgress() {
  progressOverlay.hidden = true;
  progressOverlay.classList.remove('visible');
}

btnCancel.addEventListener('click', () => {
  cancelGeneration();
  cancelTranslation();
  if (_audioDownloadAbort) _audioDownloadAbort.abort();
});

// ── Utilities ──

function updateBulkButtons() {
  const hasAudio = Object.keys(state.audioBlobs).length > 0;
  btnDownloadAll.disabled = !hasAudio;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Escape HTML entities to prevent XSS from untrusted EPUB content.
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Simple markdown to HTML renderer for display.
 * Escapes raw HTML first, then applies markdown transformations.
 */
function renderMarkdownHtml(md) {
  // Split into blocks, render each independently to avoid wrapping
  // block-level elements (h1, pre, hr, blockquote) inside <p> tags.
  const blocks = md.split(/\n\n+/);
  const rendered = blocks.map(block => {
    let html = escapeHtml(block.trim());
    if (!html) return '';

    // Block-level elements
    html = html
      .replace(/```([^`]*?)```/gs, '<pre><code>$1</code></pre>')
      .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
      .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
      .replace(/^---+$/gm, '<hr>');

    // If the block became a block-level element, return as-is
    if (/^<(h[1-6]|pre|hr)/i.test(html)) return html;

    // Inline formatting
    html = html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/!\[([^\]]*)\]\((data:[^)]+|https:\/\/[^)]+)\)/g, '<img alt="$1" src="$2">')
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\n/g, '<br>');

    // Wrap non-block content in <p>
    if (/^<(blockquote|img)/i.test(html)) return html;
    return `<p>${html}</p>`;
  });

  return rendered.filter(Boolean).join('\n');
}

// ── Keyboard shortcuts ──

document.addEventListener('keydown', (e) => {
  if (!adminMode) return; // generation shortcuts are admin-only
  // Ctrl+Shift+G (or Cmd+Shift+G on Mac): Translate & Generate selected
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'G') {
    e.preventDefault();
    translateAndGenerateSelected();
  }
  // Ctrl+Shift+A (or Cmd+Shift+A): Select all chapters
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    if (state.book) {
      const allSelected = state.selectedChapters.size === state.book.chapters.length;
      state.selectedChapters = allSelected ? new Set() : new Set(state.book.chapters.map((_, i) => i));
      renderChapterList();
    }
  }
});

// ── Speech-to-text ──

const btnStt = $('btn-stt');
const sttLangSelect = $('stt-lang-select');
const sttStatus = $('stt-status');
const sttStatusText = $('stt-status-text');
const sttPreview = $('stt-preview');
const sttTranscript = $('stt-transcript');
const btnSttClear = $('btn-stt-clear');
const btnSttUse = $('btn-stt-use');
const sttControls = $('stt-controls');

let sttSession = null;
let sttActive = false;

// Hide STT controls if not supported
if (!isSpeechRecognitionSupported()) {
  const sttSection = document.querySelector('.stt-section');
  if (sttSection) sttSection.hidden = true;
}

if (btnStt) {
  btnStt.addEventListener('click', () => {
    if (sttActive) {
      stopSTT();
    } else {
      startSTT();
    }
  });
}

function startSTT() {
  const lang = sttLangSelect?.value || 'en-US';
  try {
    sttSession = createSpeechRecognition({
      lang,
      continuous: true,
      interimResults: true,
      onResult: (transcript, isFinal) => {
        if (isFinal) {
          // Append final result
          const current = sttTranscript.value;
          sttTranscript.value = current + (current ? ' ' : '') + transcript;
        }
        // Show preview area
        sttPreview.hidden = false;
      },
      onEnd: () => {
        // Continuous mode may stop on silence — restart if still active
        if (sttActive) {
          try { sttSession.start(); } catch (_) { stopSTT(); }
        }
      },
      onError: (event) => {
        if (event.error === 'not-allowed') {
          showToast('Microphone access denied. Please allow microphone permissions.', 'error');
          stopSTT();
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          showToast(`Speech recognition error: ${event.error}`, 'error');
          stopSTT();
        }
      },
    });
    sttSession.start();
    sttActive = true;
    btnStt.innerHTML = '<span class="stt-mic recording">🎤</span> Stop Dictation';
    btnStt.classList.add('recording');
    sttStatus.hidden = false;
    sttStatusText.textContent = 'Listening...';
    sttPreview.hidden = false;
  } catch (err) {
    showToast('Failed to start speech recognition: ' + err.message, 'error');
  }
}

function stopSTT() {
  sttActive = false;
  if (sttSession) {
    try { sttSession.stop(); } catch (_) { /* ignore */ }
    sttSession = null;
  }
  btnStt.innerHTML = '<span class="stt-mic">🎤</span> Start Dictation';
  btnStt.classList.remove('recording');
  sttStatus.hidden = true;
}

if (btnSttClear) {
  btnSttClear.addEventListener('click', () => {
    sttTranscript.value = '';
  });
}

if (btnSttUse) {
  btnSttUse.addEventListener('click', () => {
    const text = sttTranscript.value.trim();
    if (!text) {
      showToast('No transcribed text to use', 'error');
      return;
    }
    stopSTT();

    // Create a book from the transcribed text
    const book = {
      title: 'Dictation',
      chapters: [{ title: 'Dictation', markdown: text, translatedMarkdown: null }],
    };

    resetStateForNewBook(state, book);
    state.bookId = `dictation-${Date.now()}`;
    _renderCache.clear();
    _previewCache.clear();
    persistBook();
    sttTranscript.value = '';
    sttPreview.hidden = true;
    showReaderScreen();
  });
}

// ── Library persistence ──

function makeBookId(title) {
  const slug = sanitizeFilename(title || '').toLowerCase().replace(/\s+/g, '-');
  return slug || 'untitled';
}

/** Persist the current book (chapters + translations) — fire-and-forget. */
function persistBook() {
  if (!state.bookId || !state.book) return;
  saveBook({
    id: state.bookId,
    title: state.book.title,
    chapters: state.book.chapters.map(ch => ({
      title: ch.title,
      markdown: ch.markdown,
      translatedMarkdown: ch.translatedMarkdown || null,
    })),
  }).catch(err => console.warn('Failed to save book to library:', err));
}

/** Persist one chapter's generated audio — fire-and-forget. */
function persistAudio(idx) {
  if (!state.bookId) return;
  saveChapterAudio(state.bookId, idx, {
    blob: state.audioBlobs[idx],
    timeline: state.audioTimelines[idx] || null,
    audioMode: state.audioModes[idx] || null,
  }).catch(err => console.warn('Failed to save audio to library:', err));
}

/** Load previously generated audio for a book into state. */
async function restoreBookAudio(bookId) {
  try {
    const records = await getBookAudio(bookId);
    for (const rec of records) {
      state.audioBlobs[rec.chapterIndex] = rec.blob;
      if (rec.timeline) state.audioTimelines[rec.chapterIndex] = rec.timeline;
      if (rec.audioMode) state.audioModes[rec.chapterIndex] = rec.audioMode;
    }
    if (records.length > 0) updateBulkButtons();
  } catch { /* persistence unavailable */ }
}

async function openBookFromLibrary(bookId, { autoListen = false } = {}) {
  try {
    const stored = await getBook(bookId);
    if (!stored) {
      showToast('Book not found in library', 'error');
      renderLibrary();
      return;
    }
    const book = {
      title: stored.title,
      chapters: stored.chapters.map(ch => ({ ...ch })),
    };
    resetStateForNewBook(state, book);
    state.bookId = bookId;
    _renderCache.clear();
    _previewCache.clear();
    await restoreBookAudio(bookId);
    showReaderScreen();

    if (autoListen) {
      let idx = null;
      try {
        const last = currentUserId ? await getLastPlayed(currentUserId, bookId) : null;
        if (last && state.audioBlobs[last.chapterIndex]) idx = last.chapterIndex;
      } catch { /* ignore */ }
      if (idx === null) {
        idx = Object.keys(state.audioBlobs).map(Number).sort((a, b) => a - b)[0];
        if (idx === undefined) idx = null;
      }
      if (idx !== null) {
        selectChapter(idx);
        openPlayer(idx);
      }
    }
  } catch (err) {
    showToast('Failed to open book: ' + err.message, 'error');
  }
}

// ── Listener profiles (multi-user) ──

const CURRENT_USER_KEY = 'audiobook.currentUser';
let currentUserId = localStorage.getItem(CURRENT_USER_KEY) || null;

async function initUsers() {
  try {
    let users = await listUsers();
    if (users.length === 0) {
      users = [await createUser('Default')];
    }
    if (!currentUserId || !users.some(u => u.id === currentUserId)) {
      currentUserId = users[0].id;
    }
    localStorage.setItem(CURRENT_USER_KEY, currentUserId);
    renderUserSelect(users);
  } catch (err) {
    console.warn('User profiles unavailable:', err);
  }
}

function renderUserSelect(users) {
  userSelect.innerHTML = '';
  for (const u of users) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    userSelect.appendChild(opt);
  }
  userSelect.value = currentUserId;
}

userSelect.addEventListener('change', () => {
  currentUserId = userSelect.value;
  localStorage.setItem(CURRENT_USER_KEY, currentUserId);
  renderLibrary();
});

btnAddUser.addEventListener('click', () => {
  userAddRow.hidden = false;
  userNameInput.value = '';
  userNameInput.focus();
});

btnUserCancel.addEventListener('click', () => {
  userAddRow.hidden = true;
});

async function saveNewUser() {
  const name = userNameInput.value.trim();
  if (!name) return;
  try {
    const user = await createUser(name);
    currentUserId = user.id;
    localStorage.setItem(CURRENT_USER_KEY, currentUserId);
    userAddRow.hidden = true;
    renderUserSelect(await listUsers());
    renderLibrary();
  } catch (err) {
    showToast('Failed to create listener: ' + err.message, 'error');
  }
}

btnUserSave.addEventListener('click', saveNewUser);
userNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveNewUser();
});

// ── Library UI ──

async function renderLibrary() {
  try {
    // The admin workspace lists locally created books only — shelf caches
    // (remote:*) belong to the user-mode shelf.
    const books = (await listBooks()).filter(b => !String(b.id).startsWith('remote:'));
    librarySection.hidden = books.length === 0;
    libraryList.innerHTML = '';
    if (books.length > 0) await refreshPublishedMap();

    for (const book of books) {
      const li = document.createElement('li');
      li.className = 'library-item';

      let audioCount = 0;
      try { audioCount = (await getBookAudio(book.id)).length; } catch { /* ignore */ }

      let last = null;
      if (currentUserId) {
        try { last = await getLastPlayed(currentUserId, book.id); } catch { /* ignore */ }
      }

      const info = document.createElement('div');
      info.className = 'library-info';
      const title = document.createElement('div');
      title.className = 'library-book-title';
      title.textContent = book.title;
      const pub = publishedEntryForTitle(book.title);
      const badge = document.createElement('span');
      badge.className = 'publish-badge ' + (pub ? 'is-published' : 'not-published');
      badge.textContent = pub ? '✅ 已发布' : '未发布';
      if (pub) badge.title = `网站版本更新于 ${formatPublishDate(pub.updatedAt)}`;
      title.appendChild(badge);
      const meta = document.createElement('div');
      meta.className = 'library-meta';
      meta.textContent = `${book.chapters.length} chapters · ${audioCount} audio`
        + (pub ? ` · 网站版 ${formatPublishDate(pub.updatedAt)}` : '');
      info.appendChild(title);
      info.appendChild(meta);
      if (last) {
        const cont = document.createElement('div');
        cont.className = 'library-continue';
        cont.textContent = `Last: ${last.chapterTitle} · ${formatTime(last.time)}`;
        info.appendChild(cont);
      }

      const actions = document.createElement('div');
      actions.className = 'library-actions';

      if (audioCount > 0) {
        const btnListen = document.createElement('button');
        btnListen.className = 'small-btn library-listen';
        btnListen.textContent = last ? '▶ Continue' : '▶ Listen';
        btnListen.addEventListener('click', (e) => {
          e.stopPropagation();
          openBookFromLibrary(book.id, { autoListen: true });
        });
        actions.appendChild(btnListen);
      }

      const btnOpen = document.createElement('button');
      btnOpen.className = 'small-btn';
      btnOpen.textContent = 'Open';
      btnOpen.addEventListener('click', (e) => {
        e.stopPropagation();
        openBookFromLibrary(book.id);
      });
      actions.appendChild(btnOpen);

      const btnDelete = document.createElement('button');
      btnDelete.className = 'small-btn library-delete';
      btnDelete.textContent = 'Delete';
      btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btnDelete.dataset.armed !== '1') {
          btnDelete.dataset.armed = '1';
          btnDelete.textContent = 'Sure?';
          setTimeout(() => {
            btnDelete.dataset.armed = '';
            btnDelete.textContent = 'Delete';
          }, 3000);
          return;
        }
        try {
          await deleteBook(book.id);
          renderLibrary();
        } catch (err) {
          showToast('Failed to delete: ' + err.message, 'error');
        }
      });
      actions.appendChild(btnDelete);

      li.appendChild(info);
      li.appendChild(actions);
      li.addEventListener('click', () => openBookFromLibrary(book.id, { autoListen: audioCount > 0 }));
      libraryList.appendChild(li);
    }
  } catch (err) {
    console.warn('Library unavailable:', err);
  }
}

// ── Player integration ──

const player = new Player({
  elements: {
    btnPlay: $('btn-player-play'),
    btnBack15: $('btn-player-back15'),
    btnFwd15: $('btn-player-fwd15'),
    btnPrev: $('btn-player-prev'),
    btnNext: $('btn-player-next'),
    btnRate: $('btn-player-rate'),
    btnClose: $('btn-player-close'),
    btnMode: $('btn-player-mode'),
    seek: $('player-seek'),
    timeCur: $('player-time-cur'),
    timeTotal: $('player-time-total'),
    text: $('player-text'),
    screen: playerScreen,
    subtitlePrev: $('player-subtitle-prev'),
    subtitleCurrent: $('player-subtitle-current'),
    subtitleNext: $('player-subtitle-next'),
    bookTitle: $('player-book-title'),
    chapterTitle: $('player-chapter-title'),
  },
  onSaveProgress: ({ chapterIndex, time, duration }) => {
    if (!state.bookId || !currentUserId || !state.book) return;
    const ch = state.book.chapters[chapterIndex];
    saveProgress({
      userId: currentUserId,
      bookId: state.bookId,
      chapterIndex,
      time,
      duration,
      chapterTitle: ch ? ch.title : '',
      bookTitle: state.book.title,
    }).catch(() => { /* persistence unavailable */ });
  },
  onRequestChapter: (dir) => {
    const next = findAudioChapter(player.chapterIndex, dir);
    if (next !== null) openPlayer(next);
  },
  onClose: () => {
    playerScreen.classList.remove('active');
    if (state.activeChapter !== null) updateChapterButtons(state.activeChapter);
  },
});

/** Find the nearest chapter with (local or remote) audio in the given direction. */
function findAudioChapter(from, dir) {
  if (from === null || !state.book) return null;
  for (let i = from + dir; i >= 0 && i < state.book.chapters.length; i += dir) {
    if (state.audioBlobs[i] || state.remoteAudioMeta[i]) return i;
  }
  return null;
}

const fmtMB = (bytes) => (bytes / 1048576).toFixed(1);
let _audioDownloadAbort = null;

/**
 * Make sure a chapter's audio blob is in memory, downloading it if remote.
 * Shows a progress dialog with streamed MB/percent (audio is stored per
 * chapter, so only the requested chapter is downloaded); once downloaded
 * it's cached in IndexedDB and plays instantly on later opens.
 */
async function ensureChapterAudio(idx) {
  if (state.audioBlobs[idx]) return true;
  const meta = state.remoteAudioMeta[idx];
  if (!meta || !state.remoteId) return false;
  const ch = state.book.chapters[idx];
  showProgress(`⬇️ 下载本章音频: ${ch.title}`);
  progressText.textContent = meta.size ? `共 ${fmtMB(meta.size)} MB，开始下载…` : '开始下载…';
  _audioDownloadAbort = new AbortController();
  try {
    const blob = await fetchRemoteAudio(state.remoteId, meta.file, import.meta.env.BASE_URL, {
      signal: _audioDownloadAbort.signal,
      onProgress: (loaded, total) => {
        const t = total || meta.size || 0;
        if (t > 0) {
          updateProgress(loaded, t, `已下载 ${fmtMB(loaded)} / ${fmtMB(t)} MB`);
        } else {
          progressText.textContent = `已下载 ${fmtMB(loaded)} MB`;
        }
      },
    });
    state.audioBlobs[idx] = blob;
    persistAudio(idx); // cache for offline replay
    if (state.activeChapter === idx) updateChapterButtons(idx);
    updateChapterRow(idx);
    return true;
  } finally {
    _audioDownloadAbort = null;
    hideProgress();
  }
}

async function openPlayer(idx) {
  if (!state.audioBlobs[idx]) {
    try {
      const ok = await ensureChapterAudio(idx);
      if (!ok) return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('音频加载失败，请检查网络后重试 (' + err.message + ')', 'error');
      }
      return;
    }
  }
  const blob = state.audioBlobs[idx];
  const ch = state.book.chapters[idx];

  // Resume from this user's saved position when meaningful
  let resumeTime = 0;
  if (currentUserId && state.bookId) {
    try {
      const rec = await getProgress(currentUserId, state.bookId, idx);
      if (rec && rec.duration > 0 && rec.time > 3 && rec.time < rec.duration - 5) {
        resumeTime = rec.time;
      }
    } catch { /* ignore */ }
  }

  playerScreen.classList.add('active');
  player.openChapter({
    bookTitle: state.book.title,
    chapterTitle: ch.title,
    chapterIndex: idx,
    originalText: ch.markdown,
    blob,
    timeline: state.audioTimelines[idx] || null,
    resumeTime,
  });
  state.activeChapter = idx;
  renderPlayerChapterList();
}

btnListenChapter.addEventListener('click', () => {
  if (state.activeChapter === null) return;
  openPlayer(state.activeChapter);
});

// Chapter drawer inside the player
const playerDrawer = $('player-drawer');
const playerChapterList = $('player-chapter-list');
const btnPlayerChapters = $('btn-player-chapters');

btnPlayerChapters.addEventListener('click', () => {
  playerDrawer.hidden = !playerDrawer.hidden;
  if (!playerDrawer.hidden) renderPlayerChapterList();
});

playerDrawer.addEventListener('click', (e) => {
  if (e.target === playerDrawer) playerDrawer.hidden = true;
});

function renderPlayerChapterList() {
  playerChapterList.innerHTML = '';
  if (!state.book) return;
  state.book.chapters.forEach((ch, idx) => {
    const li = document.createElement('li');
    li.className = 'player-chapter-item';
    const hasAudio = !!state.audioBlobs[idx];
    li.classList.toggle('current', idx === player.chapterIndex);
    li.classList.toggle('no-audio', !hasAudio);

    const name = document.createElement('span');
    name.className = 'player-chapter-name';
    name.textContent = ch.title;
    li.appendChild(name);

    const badge = document.createElement('span');
    badge.className = 'player-chapter-badge';
    badge.textContent = hasAudio ? '▶' : '—';
    li.appendChild(badge);

    if (hasAudio) {
      li.addEventListener('click', () => {
        playerDrawer.hidden = true;
        openPlayer(idx);
      });
    }
    playerChapterList.appendChild(li);
  });
}

// Save progress when the app is backgrounded or closed mid-playback
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && player.isOpen) {
    player._saveProgress(true);
  }
});

// ── User mode: access-code login + shelf of admin-published books ──

const ACCESS_KEY = 'audiobook.accessCode';
let accessCode = localStorage.getItem(ACCESS_KEY) || '';

function showLoginError(msg) {
  loginError.textContent = msg;
  loginError.hidden = !msg;
}

async function doLogin() {
  const code = accessCodeInput.value.trim();
  if (!code) return;
  btnLogin.disabled = true;
  showLoginError('');
  try {
    const catalog = await fetchCatalog(import.meta.env.BASE_URL);
    if (!isKnownCode(catalog, code)) {
      showLoginError('访问码无效 — 请联系管理员微信 tumei321123');
      return;
    }
    accessCode = code;
    localStorage.setItem(ACCESS_KEY, code);
    currentUserId = `code:${code.toLowerCase()}`;
    renderUserHome();
    renderShelf(catalog);
  } catch (err) {
    showLoginError('无法连接书架服务，请稍后再试 (' + err.message + ')');
  } finally {
    btnLogin.disabled = false;
  }
}

btnLogin.addEventListener('click', doLogin);
accessCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

btnLogout.addEventListener('click', () => {
  accessCode = '';
  localStorage.removeItem(ACCESS_KEY);
  renderUserHome();
});

btnCopyWechat.addEventListener('click', () => {
  navigator.clipboard.writeText('tumei321123').then(() => {
    btnCopyWechat.textContent = '已复制 ✓';
    setTimeout(() => { btnCopyWechat.textContent = '复制微信号'; }, 2000);
  });
});

/** Show login card or shelf depending on login state (user mode home). */
function renderUserHome() {
  const loggedIn = !!accessCode;
  loginCard.hidden = adminMode || loggedIn;
  shelfSection.hidden = !adminMode && !loggedIn;
  shelfCodeLabel.textContent = adminMode ? '(admin — all books)' : (accessCode ? `· ${accessCode}` : '');
}

/** Render the shelf: admin sees every published book, users see their own. */
async function renderShelf(prefetchedCatalog) {
  if (shelfSection.hidden) return;
  shelfList.innerHTML = '';
  shelfEmpty.hidden = true;
  try {
    const catalog = prefetchedCatalog || await fetchCatalog(import.meta.env.BASE_URL);
    // 权限暂时全开放：所有登录用户都能看到全部书籍（按 2026-07 要求；
    // 恢复按码过滤时改回 visibleBooks(catalog, accessCode)）
    const books = (catalog.books || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    void visibleBooks;
    shelfEmpty.hidden = books.length > 0;

    shelfAdminTools.hidden = !adminMode;
    if (adminMode) {
      const codes = catalog.validCodes || [];
      validCodesLabel.textContent = codes.length
        ? `已登记访问码 (${codes.length}): ${codes.join(', ')}`
        : '尚未登记任何访问码';
      currentValidCodes = codes;
    }

    for (const entry of books) {
      const li = document.createElement('li');
      li.className = 'library-item';

      const info = document.createElement('div');
      info.className = 'library-info';
      const title = document.createElement('div');
      title.className = 'library-book-title';
      title.textContent = entry.title;
      const meta = document.createElement('div');
      meta.className = 'library-meta';
      const parts = [`${entry.chapterCount || '?'} 章`, `${entry.audioCount || 0} 段音频`];
      if (adminMode) parts.push(entry.access === 'public' ? '公开' : `访问码: ${(entry.access || []).join(', ')}`);
      meta.textContent = parts.join(' · ');
      info.appendChild(title);
      info.appendChild(meta);

      if (currentUserId) {
        try {
          const last = await getLastPlayed(currentUserId, `remote:${entry.id}`);
          if (last) {
            const cont = document.createElement('div');
            cont.className = 'library-continue';
            cont.textContent = `上次听到: ${last.chapterTitle} · ${formatTime(last.time)}`;
            info.appendChild(cont);
          }
        } catch { /* ignore */ }
      }

      const actions = document.createElement('div');
      actions.className = 'library-actions';
      const btnOpen = document.createElement('button');
      btnOpen.className = 'small-btn library-listen';
      btnOpen.textContent = '▶ 打开';
      actions.appendChild(btnOpen);

      if (adminMode) {
        const btnAccess = document.createElement('button');
        btnAccess.className = 'small-btn';
        btnAccess.textContent = '✏️ 权限';
        btnAccess.title = '修改哪些访问码能看到这本书';
        btnAccess.addEventListener('click', (e) => {
          e.stopPropagation();
          openAccessEditor(entry);
        });
        actions.appendChild(btnAccess);

        const btnRemove = document.createElement('button');
        btnRemove.className = 'small-btn library-delete';
        btnRemove.textContent = '🗑';
        btnRemove.title = '从网站下架这本书';
        btnRemove.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btnRemove.dataset.armed) {
            removeRemoteBook(entry, btnRemove);
          } else {
            btnRemove.dataset.armed = '1';
            btnRemove.textContent = '确认下架?';
            setTimeout(() => {
              delete btnRemove.dataset.armed;
              btnRemove.textContent = '🗑';
            }, 3000);
          }
        });
        actions.appendChild(btnRemove);
      }

      li.appendChild(info);
      li.appendChild(actions);
      li.addEventListener('click', () => openRemoteBook(entry));
      shelfList.appendChild(li);
    }
  } catch (err) {
    shelfEmpty.textContent = '无法加载书架，请检查网络后刷新 (' + err.message + ')';
    shelfEmpty.hidden = false;
  }
}

/** Open an admin-published book: text immediately, audio on demand. */
async function openRemoteBook(entry) {
  const storageId = `remote:${entry.id}`;
  try {
    let data;
    try {
      data = await fetchRemoteBook(entry.id, import.meta.env.BASE_URL);
      // Cache for offline reopening
      saveBook({
        id: storageId,
        title: data.title,
        chapters: data.chapters.map(ch => ({
          title: ch.title, markdown: ch.markdown, translatedMarkdown: ch.translatedMarkdown,
        })),
        remoteMeta: data.chapters.map(ch => ({
          audioFile: ch.audioFile, audioMode: ch.audioMode, timeline: ch.timeline,
        })),
      }).catch(() => {});
    } catch (err) {
      // Offline fallback: use the cached copy if we have one
      const cached = await getBook(storageId);
      if (!cached) throw err;
      data = {
        title: cached.title,
        chapters: cached.chapters.map((ch, i) => ({
          ...ch,
          audioFile: cached.remoteMeta?.[i]?.audioFile || null,
          audioMode: cached.remoteMeta?.[i]?.audioMode || null,
          timeline: cached.remoteMeta?.[i]?.timeline || null,
        })),
      };
    }

    const book = {
      title: data.title,
      chapters: data.chapters.map(ch => ({
        title: ch.title,
        markdown: ch.markdown,
        translatedMarkdown: ch.translatedMarkdown || null,
      })),
    };
    resetStateForNewBook(state, book);
    state.bookId = storageId;
    state.remoteId = entry.id;
    data.chapters.forEach((ch, i) => {
      if (ch.audioFile) {
        state.remoteAudioMeta[i] = { file: ch.audioFile, size: ch.audioSize || 0 };
        if (ch.timeline) state.audioTimelines[i] = ch.timeline;
        if (ch.audioMode) state.audioModes[i] = ch.audioMode;
      }
    });
    _renderCache.clear();
    _previewCache.clear();
    await restoreBookAudio(storageId); // previously downloaded chapters
    showReaderScreen();

    // Jump straight back to where this user left off
    if (currentUserId) {
      try {
        const last = await getLastPlayed(currentUserId, storageId);
        if (last && (state.audioBlobs[last.chapterIndex] || state.remoteAudioMeta[last.chapterIndex])) {
          selectChapter(last.chapterIndex);
        }
      } catch { /* ignore */ }
    }
  } catch (err) {
    showToast('无法打开书籍: ' + err.message, 'error');
  }
}

// ── Admin: one-click publish + remote management ──

let currentValidCodes = [];

// .progress-overlay is display:none until the `visible` class is added —
// toggling [hidden] alone never shows these modals
function showModal(el) { el.hidden = false; el.classList.add('visible'); }
function hideModal(el) { el.hidden = true; el.classList.remove('visible'); }

// ── Published-state indicators (admin) ──

let publishedBooks = {}; // publishId -> catalog entry

async function refreshPublishedMap() {
  try {
    const catalog = await fetchCatalog(import.meta.env.BASE_URL);
    publishedBooks = {};
    for (const b of catalog.books || []) publishedBooks[b.id] = b;
  } catch { /* offline — keep last known state */ }
  return publishedBooks;
}

function publishedEntryForTitle(title) {
  return publishedBooks[makePublishId(title || '')] || null;
}

/** Published entry for the book open in the reader (remote books by their id). */
function currentPublishedEntry() {
  if (!state.book) return null;
  if (state.remoteId) return publishedBooks[state.remoteId] || null;
  return publishedEntryForTitle(state.book.title);
}

/** Reflect the current book's published state on the sidebar publish button. */
function refreshPublishIndicator() {
  if (!state.book) return;
  const entry = currentPublishedEntry();
  btnPublishSite.classList.toggle('is-published', !!entry);
  btnPublishSite.textContent = entry ? '✅ 已发布 · 点此更新网站版本' : '🚀 发布到网站';
  btnPublishSite.title = entry
    ? `已于 ${formatPublishDate(entry.updatedAt)} 发布（${entry.audioCount} 段音频）— 再次发布会覆盖网站版本`
    : '一键发布到 audiobook.tumei.online — 用户书架立即可见';
}

function formatPublishDate(ts) {
  if (!ts) return '?';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ask for / remember the admin password; returns '' if the field is empty. */
function readTokenField(input) {
  const token = (input.value || '').trim();
  if (token) saveToken(token);
  return token;
}

function openPublishModal() {
  if (!state.book) return;
  const audioCount = Object.keys(state.audioBlobs).length;
  if (audioCount === 0) {
    showToast('还没有生成音频 — 先生成 MP3 再发布', 'error');
    return;
  }
  const existing = currentPublishedEntry();
  publishModalInfo.textContent =
    `《${state.book.title}》 · ${state.book.chapters.length} 章 · ${audioCount} 段音频`
    + (existing ? ` — 已于 ${formatPublishDate(existing.updatedAt)} 发布过，本次发布将覆盖网站版本` : '');
  publishAccessInput.value = '';
  publishTokenInput.value = getSavedToken();
  publishForm.hidden = false;
  publishResult.hidden = true;
  publishResult.textContent = '';
  publishProgressRow.hidden = true;
  publishModalStatus.textContent = '';
  btnPublishConfirm.disabled = false;
  btnPublishConfirm.hidden = false;
  btnPublishCancel.textContent = '取消';
  showModal(publishModal);
  (getSavedToken() ? publishAccessInput : publishTokenInput).focus();
}

/** Swap the publish modal into its result view (stays open until closed). */
function showPublishResult(ok, lines) {
  publishForm.hidden = ok; // failure keeps the form visible for a retry
  publishProgressRow.hidden = true;
  publishModalStatus.textContent = '';
  publishResult.hidden = false;
  publishResult.textContent = '';
  publishResult.className = 'publish-result ' + (ok ? 'publish-ok' : 'publish-fail');
  const icon = document.createElement('div');
  icon.className = 'publish-result-icon';
  icon.textContent = ok ? '✅' : '❌';
  publishResult.appendChild(icon);
  for (const [i, line] of lines.entries()) {
    const p = document.createElement('p');
    p.className = i === 0 ? 'publish-result-title' : 'publish-result-line';
    p.textContent = line;
    publishResult.appendChild(p);
  }
  btnPublishConfirm.hidden = ok;
  btnPublishConfirm.disabled = false;
  btnPublishConfirm.textContent = ok ? '发布' : '重试';
  btnPublishCancel.textContent = '关闭';
}

async function doPublishToSite() {
  const token = readTokenField(publishTokenInput);
  if (!token) {
    publishModalStatus.textContent = '请输入管理员密码';
    publishTokenInput.focus();
    return;
  }
  const access = normalizeAccessInput(publishAccessInput.value);
  btnPublishConfirm.disabled = true;
  publishResult.hidden = true;
  publishModalStatus.textContent = '正在打包…';
  try {
    const publishId = makePublishId(state.book.title);
    const { blob, manifest } = await buildPublishZip(
      state.book, publishId, state.audioBlobs, state.audioTimelines, state.audioModes
    );
    publishProgressRow.hidden = false;
    publishModalStatus.textContent = `正在上传 (${(blob.size / 1024 / 1024).toFixed(1)} MB)…`;
    const result = await uploadPublishZip(token, blob, access, (frac) => {
      const pct = Math.round(frac * 100);
      publishProgressBar.style.width = pct + '%';
      publishProgressPercent.textContent = pct + '%';
    });
    const who = result.book.access === 'public' ? '所有登录用户' : `访问码 ${result.book.access.join(', ')}`;
    showPublishResult(true, [
      '发布成功！',
      `《${result.book.title}》已上线 — ${result.book.chapterCount} 章 · ${countAudioChapters(manifest)} 段音频`,
      `可见范围：${who}`,
      '用户刷新书架即可看到这本书。',
    ]);
    publishedBooks[result.book.id] = result.book;
    refreshPublishIndicator();
    renderShelf();
    renderLibrary();
  } catch (err) {
    if (err.badToken) {
      clearToken();
      publishTokenInput.value = '';
    }
    showPublishResult(false, [
      '发布失败',
      err.message,
      err.badToken ? '请重新输入管理员密码后点"重试"。' : '请检查网络后点"重试"；书籍和音频仍在本机，不会丢失。',
    ]);
    if (err.badToken) publishTokenInput.focus();
  }
}

btnPublishSite.addEventListener('click', openPublishModal);
btnPublishConfirm.addEventListener('click', doPublishToSite);
btnPublishCancel.addEventListener('click', () => { hideModal(publishModal); });
publishAccessInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doPublishToSite(); });
publishTokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doPublishToSite(); });

/**
 * Generic one-field admin editor. onSave(value, token) should call the API
 * and throw on failure; a thrown badToken error re-prompts for the password.
 */
function openFieldModal({ title, hint, value, onSave }) {
  fieldModalTitle.textContent = title;
  fieldModalHint.textContent = hint;
  fieldModalInput.value = value;
  fieldModalStatus.textContent = '';
  fieldModalTokenRow.hidden = !!getSavedToken();
  fieldModalToken.value = '';
  btnFieldSave.disabled = false;
  showModal(fieldModal);
  fieldModalInput.focus();

  btnFieldSave.onclick = async () => {
    const token = getSavedToken() || readTokenField(fieldModalToken);
    if (!token) {
      fieldModalStatus.textContent = '请输入管理员密码';
      fieldModalTokenRow.hidden = false;
      fieldModalToken.focus();
      return;
    }
    btnFieldSave.disabled = true;
    fieldModalStatus.textContent = '正在保存…';
    try {
      await onSave(fieldModalInput.value, token);
      hideModal(fieldModal);
      renderShelf();
    } catch (err) {
      if (err.badToken) {
        clearToken();
        fieldModalTokenRow.hidden = false;
        fieldModalToken.focus();
      }
      fieldModalStatus.textContent = '保存失败: ' + err.message;
      btnFieldSave.disabled = false;
    }
  };
}

btnFieldCancel.addEventListener('click', () => { hideModal(fieldModal); });

function openAccessEditor(entry) {
  openFieldModal({
    title: `✏️ 《${entry.title}》的访问权限`,
    hint: '逗号分隔的访问码；public 为所有登录用户可见',
    value: accessToInput(entry.access),
    onSave: async (value, token) => {
      const access = normalizeAccessInput(value);
      await setBookAccess(token, entry.id, access);
      showToast(`已更新《${entry.title}》权限: ${access}`, 'success');
    },
  });
}

btnManageCodes.addEventListener('click', () => {
  openFieldModal({
    title: '🔑 登记的访问码',
    hint: '逗号分隔。这些码可以登录（即使还没分配书）；删除的码将无法登录。',
    value: currentValidCodes.join(', '),
    onSave: async (value, token) => {
      const codes = value.split(/[,，、\s]+/).map(c => c.trim()).filter(Boolean);
      const result = await setValidCodes(token, codes);
      showToast(`访问码已更新 (${result.validCodes.length} 个)`, 'success');
    },
  });
});

async function removeRemoteBook(entry, btn) {
  const token = getSavedToken();
  if (!token) {
    openFieldModal({
      title: `🗑 下架《${entry.title}》`,
      hint: '输入管理员密码确认下架（书籍文件将从网站删除）',
      value: entry.id,
      onSave: async (_value, tok) => {
        await apiDeleteBook(tok, entry.id);
        showToast(`已下架《${entry.title}》`, 'success');
      },
    });
    return;
  }
  btn.disabled = true;
  try {
    await apiDeleteBook(token, entry.id);
    showToast(`已下架《${entry.title}》`, 'success');
    renderShelf();
  } catch (err) {
    if (err.badToken) clearToken();
    showToast('下架失败: ' + err.message, 'error');
    btn.disabled = false;
  }
}

// ── Admin: export publish package (fallback for the script workflow) ──

btnExportPublish.addEventListener('click', async () => {
  if (!state.book) return;
  const audioCount = Object.keys(state.audioBlobs).length;
  if (audioCount === 0) {
    showToast('No audio generated yet — generate MP3s before publishing', 'error');
    return;
  }
  try {
    const publishId = makePublishId(state.book.title);
    const { blob, filename, manifest } = await buildPublishZip(
      state.book, publishId, state.audioBlobs, state.audioTimelines, state.audioModes
    );
    downloadBlob(blob, filename);
    showToast(
      `Publish package ready (${countAudioChapters(manifest)} audio chapters). ` +
      `Run: bash deploy/publish-book.sh ~/Downloads/${filename} <access-codes>`,
      'success', 10000
    );
  } catch (err) {
    showToast('Publish export failed: ' + err.message, 'error');
  }
});

// ── App startup ──

function initHome() {
  renderUserHome();
  if (adminMode) {
    initUsers().then(renderLibrary);
    renderShelf();
  } else {
    if (accessCode) currentUserId = `code:${accessCode.toLowerCase()}`;
    renderShelf();
  }
}

initHome();

// Debug/E2E hook — lets tests inject audio and drive the player
window.__audiobook = { state, openPlayer, renderLibrary, persistAudio };

// Register the service worker for offline/PWA support (production builds only)
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch(err => console.warn('Service worker registration failed:', err));
}
