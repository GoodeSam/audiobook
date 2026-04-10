/**
 * EPUB to Audiobook - Main application.
 *
 * Orchestrates upload, parsing, markdown conversion, translation, and TTS.
 */

import { parseEPUB } from './epub-parser.js';
import { htmlToMarkdown, cleanMarkdown } from './html-to-markdown.js';
import { generateChapterAudio, cancelGeneration, synthesizeText } from './edge-tts.js';
import { translateChapter, cancelTranslation, resetTranslationState } from './ms-translator.js';
import { sanitizeFilename, exportMultipleChapters } from './chapter-export.js';
import { ProgressTracker } from './progress-tracker.js';
import { buildBilingualMarkdown } from './bilingual-view.js';
import { createAppState, resetStateForNewBook, resetStateOnError } from './app-state.js';

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

// ── Upload handling ──

const DROP_ZONE_DEFAULT = `
  <div class="drop-icon">📖</div>
  <p>Drag & drop an EPUB file here</p>
  <p class="or">or</p>
  <label class="file-btn">Choose File<input type="file" accept=".epub" hidden></label>
`;

function resetDropZone(errorMsg) {
  if (errorMsg) {
    const safe = errorMsg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    dropZone.innerHTML = `
      <div class="drop-icon">📖</div>
      <p style="color: var(--danger)">Error: ${safe}</p>
      <p class="or">Try another file</p>
      <label class="file-btn">Choose File<input type="file" accept=".epub" hidden></label>
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
  if (file?.name.toLowerCase().endsWith('.epub')) handleFile(file);
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

    dropZone.innerHTML = '<p>Parsing EPUB...</p>';
    const book = await parseEPUB(file);

    for (const ch of book.chapters) {
      ch.markdown = cleanMarkdown(htmlToMarkdown(ch.html));
      ch.translatedMarkdown = null;
    }

    // Reset all state flags (including generating and working)
    resetStateForNewBook(state, book);

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
}

btnBack.addEventListener('click', () => {
  // Cancel any in-progress operations so generating doesn't stay stuck
  cancelGeneration();
  cancelTranslation();
  state.generating = false;
  hideProgress();

  readerScreen.classList.remove('active');
  uploadScreen.classList.add('active');
  resetDropZone();
});

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

async function previewVoice(voice, speechRate, sampleKey, btn) {
  // If already playing from this button, stop
  if (_previewPlaying && _previewBtn === btn) {
    stopPreview(btn);
    return;
  }
  // Stop any other preview
  if (_previewBtn && _previewBtn !== btn) stopPreview(_previewBtn);
  cleanupPreview();

  btn.disabled = true;
  btn.textContent = '...';
  _previewBtn = btn;

  try {
    const blob = await synthesizeText(PREVIEW_SAMPLES[sampleKey], { voice, speechRate });
    _previewUrl = URL.createObjectURL(blob);
    _previewAudio = new Audio(_previewUrl);
    _previewPlaying = true;
    _previewAudio.onended = () => stopPreview(btn);
    btn.textContent = '\u25A0';
    btn.disabled = false;
    _previewAudio.play();
  } catch {
    cleanupPreview();
    _previewPlaying = false;
    _previewBtn = null;
    btn.textContent = '\u25B6';
    btn.disabled = false;
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
  chapterList.innerHTML = '';
  state.book.chapters.forEach((ch, idx) => {
    const li = document.createElement('li');
    li.className = 'chapter-item';
    li.dataset.index = idx;
    li.tabIndex = 0;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', idx === state.activeChapter ? 'true' : 'false');
    if (idx === state.activeChapter) li.classList.add('active');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selectedChapters.has(idx);
    cb.addEventListener('click', (e) => {
      e.stopPropagation();
      handleCheckboxClick(idx, cb.checked, e.shiftKey);
    });

    const icons = document.createElement('span');
    icons.className = 'status-icons';
    const hasTrCp = !!state.translationCheckpoints[idx];
    const hasAuCp = !!state.audioCheckpoints[idx];
    if (ch.translatedMarkdown && !hasTrCp) icons.innerHTML += '<span class="status-icon" title="Translated">🌐</span>';
    else if (hasTrCp) icons.innerHTML += '<span class="status-icon" title="Translation paused">⏸</span>';
    if (state.audioBlobs[idx] && !hasAuCp) icons.innerHTML += '<span class="status-icon" title="Audio ready">🔊</span>';
    else if (hasAuCp) icons.innerHTML += '<span class="status-icon" title="Audio paused">⏸</span>';
    if (!ch.translatedMarkdown && !state.audioBlobs[idx] && !hasTrCp && !hasAuCp) icons.innerHTML = '<span class="status-icon">📄</span>';

    const name = document.createElement('span');
    name.className = 'chapter-name';
    name.textContent = ch.title;
    name.title = ch.title;

    li.appendChild(cb);
    li.appendChild(icons);
    li.appendChild(name);
    li.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') selectChapter(idx);
    });
    li.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectChapter(idx); }
    });
    chapterList.appendChild(li);
  });
  updateBulkButtons();
}

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

  // Download buttons
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

function showTab(tab) {
  const ch = state.book.chapters[state.activeChapter];
  if (!ch) return;

  const notTranslatedMsg = '<p style="color: var(--muted)">Not yet translated. Click "Translate" to translate this chapter.</p>';

  if (tab === 'translated' && ch.translatedMarkdown) {
    chapterMarkdown.innerHTML = renderMarkdownHtml(ch.translatedMarkdown);
  } else if (tab === 'translated') {
    chapterMarkdown.innerHTML = notTranslatedMsg;
  } else if (tab === 'bilingual' && ch.translatedMarkdown) {
    const bilingual = buildBilingualMarkdown(ch.markdown, ch.translatedMarkdown);
    chapterMarkdown.innerHTML = renderMarkdownHtml(bilingual);
  } else if (tab === 'bilingual') {
    chapterMarkdown.innerHTML = notTranslatedMsg;
  } else {
    chapterMarkdown.innerHTML = renderMarkdownHtml(ch.markdown);
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
      onCheckpoint: (cpData) => { state.translationCheckpoints[idx] = cpData; },
    });
    ch.translatedMarkdown = translated;
    delete state.translationCheckpoints[idx]; // Clear checkpoint on success
    renderChapterList();
    updateTabs();
    showTab(state.activeTab);
    if (state.activeChapter === idx) updateChapterButtons(idx);
  } catch (err) {
    // Checkpoint is preserved in state.translationCheckpoints[idx] for resume
    if (!err.message.includes('cancelled')) {
      alert('Translation error: ' + err.message);
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
  const toTranslate = indices.filter(i => !state.book.chapters[i].translatedMarkdown);

  const tracker = new ProgressTracker([{ name: 'translating', weight: 1.0 }]);
  tracker.onProgress((s) => {
    setProgressPercent(s.overallPercent);
    progressText.textContent = tracker.statusText;
  });

  showProgress('Translating chapters...');

  try {
    // Count only translatable paragraphs (skip headings, images, rules)
    const isTranslatable = (p) => {
      const t = p.trim();
      return t && !/^#{1,6}\s+/.test(t) && !/^!\[.*\]\(.*\)$/.test(t) && !/^---+$/.test(t);
    };
    let totalParas = 0;
    for (const idx of toTranslate) {
      const md = state.book.chapters[idx].markdown;
      totalParas += md.split(/\n\n+/).filter(isTranslatable).length;
    }
    tracker.startPhase('translating', totalParas);
    let completedParas = 0;

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const ch = state.book.chapters[idx];

      if (ch.translatedMarkdown) continue;

      progressTitle.textContent = `Translating ${i + 1}/${indices.length}: ${ch.title}`;
      resetTranslationState();

      const translated = await translateChapter(ch.markdown, fromLang, toLang, {
        onProgress: (current) => {
          tracker.advance(completedParas + current);
        },
      });

      completedParas += ch.markdown.split(/\n\n+/).filter(isTranslatable).length;
      ch.translatedMarkdown = translated;
      renderChapterList();
    }
  } catch (err) {
    if (!err.message.includes('cancelled')) {
      alert('Translation error: ' + err.message);
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

  // Check if translation is needed
  if ((mode === 'translated' || mode === 'bilingual') && !ch.translatedMarkdown) {
    await translateSingleChapter(idx);
    if (!ch.translatedMarkdown) return; // Translation failed or cancelled
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
    const blob = await generateChapterAudio({
      originalText: ch.markdown,
      translatedText: ch.translatedMarkdown,
      audioMode: mode,
      voiceEn: voiceEnSelect.value,
      voiceZh: voiceZhSelect.value,
      speechRateEn: parseInt(speedEnRange.value),
      speechRateZh: parseInt(speedZhRange.value),
      startIndex: acp ? acp.completedIndex : 0,
      existingBlobs: acp ? acp.audioBlobs : [],
      onProgress: (current, total) => {
        tracker.startPhase('generating', total);
        tracker.advance(current);
      },
      onCheckpoint: (cpData) => { state.audioCheckpoints[idx] = cpData; },
    });

    state.audioBlobs[idx] = blob;
    delete state.audioCheckpoints[idx]; // Clear checkpoint on success
    renderChapterList();
    selectChapter(idx);
  } catch (err) {
    // Checkpoint is preserved in state.audioCheckpoints[idx] for resume
    if (!err.message.includes('cancelled')) {
      alert('Error generating audio: ' + err.message);
    }
  } finally {
    state.generating = false;
    hideProgress();
  }
}

async function generateMultipleChapters(indices) {
  const mode = audioModeSelect.value;
  const total = indices.length;
  const needsTranslation = mode === 'translated' || mode === 'bilingual';
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

        const translated = await translateChapter(ch.markdown, fromLang, toLang, {
          startIndex: tcp ? tcp.completedIndex : 0,
          existingTranslations: tcp ? tcp.translatedParagraphs : [],
          onProgress: (current, paraTotal) => {
            tracker.advance(i + current / paraTotal);
          },
          onCheckpoint: (cpData) => { state.translationCheckpoints[idx] = cpData; },
        });
        ch.translatedMarkdown = translated;
        delete state.translationCheckpoints[idx];
        tracker.advance(i + 1);
        renderChapterList();
      }
    }

    // Phase 2: Generate audio
    if (toGenerate.length > 0) {
      tracker.startPhase('generating', toGenerate.length);

      for (let i = 0; i < toGenerate.length; i++) {
        const idx = toGenerate[i];
        const ch = state.book.chapters[idx];
        const acp = state.audioCheckpoints[idx];
        progressTitle.textContent = `Generating ${i + 1}/${toGenerate.length}: ${ch.title}${acp ? ' (resuming)' : ''}`;

        const blob = await generateChapterAudio({
          originalText: ch.markdown,
          translatedText: ch.translatedMarkdown,
          audioMode: mode,
          voiceEn: voiceEnSelect.value,
          voiceZh: voiceZhSelect.value,
          speechRateEn: parseInt(speedEnRange.value),
          speechRateZh: parseInt(speedZhRange.value),
          startIndex: acp ? acp.completedIndex : 0,
          existingBlobs: acp ? acp.audioBlobs : [],
          onProgress: (current, segTotal) => {
            tracker.advance(i + current / segTotal);
          },
          onCheckpoint: (cpData) => { state.audioCheckpoints[idx] = cpData; },
        });

        state.audioBlobs[idx] = blob;
        delete state.audioCheckpoints[idx];
        tracker.advance(i + 1);
        renderChapterList();
      }
    }

    updateBulkButtons();
  } catch (err) {
    if (!err.message.includes('cancelled')) {
      alert('Error: ' + err.message);
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

btnDownloadMd.addEventListener('click', () => {
  if (state.activeChapter === null) return;
  const ch = state.book.chapters[state.activeChapter];
  const blob = new Blob([ch.markdown], { type: 'text/markdown' });
  downloadBlob(blob, `${sanitizeFilename(ch.title)}.md`);
});

btnExportSelected.addEventListener('click', async () => {
  const indices = [...state.selectedChapters].sort((a, b) => a - b);
  if (indices.length === 0) return;

  const hasTranslations = indices.some(i => state.book.chapters[i].translatedMarkdown);
  const files = exportMultipleChapters(state.book.chapters, indices, { includeTranslation: hasTranslations });

  if (files.length === 1) {
    const blob = new Blob([files[0].content], { type: 'text/markdown' });
    downloadBlob(blob, files[0].filename);
    return;
  }

  // Multiple files -> ZIP
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, f.content);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `${sanitizeFilename(state.book.title)}_chapters.zip`);
});

btnDownloadAll.addEventListener('click', async () => {
  const blobs = state.audioBlobs;
  if (Object.keys(blobs).length === 0) return;

  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const chapters = state.book.chapters;

  for (let i = 0; i < chapters.length; i++) {
    const prefix = String(i + 1).padStart(3, '0');
    const safeName = sanitizeFilename(chapters[i].title);
    if (blobs[i]) zip.file(`${prefix}_${safeName}.mp3`, blobs[i]);
    zip.file(`${prefix}_${safeName}.md`, chapters[i].markdown);
    if (chapters[i].translatedMarkdown) {
      zip.file(`${prefix}_${safeName}_translated.md`, chapters[i].translatedMarkdown);
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `${sanitizeFilename(state.book.title)}.zip`);
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
