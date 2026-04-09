/**
 * EPUB to Audiobook - Main application.
 *
 * Orchestrates upload, parsing, markdown conversion, translation, and TTS.
 */

import { parseEPUB } from './epub-parser.js';
import { htmlToMarkdown, cleanMarkdown } from './html-to-markdown.js';
import { generateChapterAudio, cancelGeneration } from './edge-tts.js';
import { translateChapter, cancelTranslation, resetTranslationState } from './ms-translator.js';
import { sanitizeFilename, exportMultipleChapters } from './chapter-export.js';
import { ProgressTracker } from './progress-tracker.js';
import { createAppState, resetStateForNewBook } from './app-state.js';

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
    dropZone.innerHTML = `
      <div class="drop-icon">📖</div>
      <p style="color: var(--danger)">Error: ${errorMsg}</p>
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
  if (file?.name.endsWith('.epub')) handleFile(file);
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
  try {
    dropZone.innerHTML = '<p>Parsing EPUB...</p>';
    const book = await parseEPUB(file);

    for (const ch of book.chapters) {
      ch.markdown = cleanMarkdown(htmlToMarkdown(ch.html));
      ch.translatedMarkdown = null;
    }

    // Reset all state flags (including generating) to prevent stale locks
    resetStateForNewBook(state, book);

    // Restore drop zone before switching screens so it's ready if user comes back
    resetDropZone();
    showReaderScreen();
  } catch (err) {
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

speedEnRange.addEventListener('input', () => {
  const v = speedEnRange.value;
  speedEnLabel.textContent = `${v >= 0 ? '+' : ''}${v}%`;
});
speedZhRange.addEventListener('input', () => {
  const v = speedZhRange.value;
  speedZhLabel.textContent = `${v >= 0 ? '+' : ''}${v}%`;
});

// ── Chapter list ──

function renderChapterList() {
  chapterList.innerHTML = '';
  state.book.chapters.forEach((ch, idx) => {
    const li = document.createElement('li');
    li.className = 'chapter-item';
    li.dataset.index = idx;
    if (idx === state.activeChapter) li.classList.add('active');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selectedChapters.has(idx);
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      if (cb.checked) state.selectedChapters.add(idx);
      else state.selectedChapters.delete(idx);
    });

    const icons = document.createElement('span');
    icons.className = 'status-icons';
    if (ch.translatedMarkdown) icons.innerHTML += '<span class="status-icon" title="Translated">🌐</span>';
    if (state.audioBlobs[idx]) icons.innerHTML += '<span class="status-icon" title="Audio ready">🔊</span>';
    if (!ch.translatedMarkdown && !state.audioBlobs[idx]) icons.innerHTML = '<span class="status-icon">📄</span>';

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
    chapterList.appendChild(li);
  });
  updateBulkButtons();
}

function selectChapter(idx) {
  state.activeChapter = idx;
  const ch = state.book.chapters[idx];

  for (const item of chapterList.children) {
    item.classList.toggle('active', parseInt(item.dataset.index) === idx);
  }

  contentPlaceholder.hidden = true;
  chapterView.hidden = false;
  chapterTitle.textContent = ch.title;

  // Update tabs
  updateTabs();
  showTab(state.activeTab);

  btnDownloadChapter.disabled = !state.audioBlobs[idx];
}

function showPlaceholder() {
  contentPlaceholder.hidden = false;
  chapterView.hidden = true;
}

// ── Tabs ──

function updateTabs() {
  const ch = state.book.chapters[state.activeChapter];
  const translatedTab = document.querySelector('.tab-btn[data-tab="translated"]');
  translatedTab.classList.toggle('has-content', !!ch?.translatedMarkdown);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    state.activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    showTab(btn.dataset.tab);
  });
});

function showTab(tab) {
  const ch = state.book.chapters[state.activeChapter];
  if (!ch) return;

  if (tab === 'translated' && ch.translatedMarkdown) {
    chapterMarkdown.innerHTML = renderMarkdownHtml(ch.translatedMarkdown);
  } else if (tab === 'translated') {
    chapterMarkdown.innerHTML = '<p style="color: var(--muted)">Not yet translated. Click "Translate" to translate this chapter.</p>';
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
  showProgress('Translating: ' + ch.title);

  try {
    resetTranslationState();
    const translated = await translateChapter(ch.markdown, fromLang, toLang, {
      onProgress: (current, total) => updateProgress(current, total, `Translating: ${current} / ${total} paragraphs`),
    });
    ch.translatedMarkdown = translated;
    renderChapterList();
    updateTabs();
    showTab(state.activeTab);
  } catch (err) {
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
    progressBar.style.width = `${s.overallPercent}%`;
    progressText.textContent = tracker.statusText;
  });

  showProgress('Translating chapters...');

  try {
    // Count total paragraphs across all chapters for accurate progress
    let totalParas = 0;
    for (const idx of toTranslate) {
      const md = state.book.chapters[idx].markdown;
      totalParas += md.split(/\n\n+/).filter(p => p.trim()).length;
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

      completedParas += ch.markdown.split(/\n\n+/).filter(p => p.trim()).length;
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
  await generateSingleChapter(state.activeChapter);
});

btnGenerateSelected.addEventListener('click', async () => {
  if (state.generating || state.selectedChapters.size === 0) return;
  await generateMultipleChapters([...state.selectedChapters].sort((a, b) => a - b));
});

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
    progressBar.style.width = `${s.overallPercent}%`;
    progressText.textContent = s.phase === 'generating'
      ? `Generating: ${s.current} / ${s.total} segments`
      : tracker.statusText;
  });

  showProgress('Generating: ' + ch.title);

  try {
    tracker.startPhase('generating', 1); // Will be updated inside generateChapterAudio
    const blob = await generateChapterAudio({
      originalText: ch.markdown,
      translatedText: ch.translatedMarkdown,
      audioMode: mode,
      voiceEn: voiceEnSelect.value,
      voiceZh: voiceZhSelect.value,
      speechRateEn: parseInt(speedEnRange.value),
      speechRateZh: parseInt(speedZhRange.value),
      onProgress: (current, total) => {
        tracker.startPhase('generating', total);
        tracker.advance(current);
      },
    });

    state.audioBlobs[idx] = blob;
    renderChapterList();
    selectChapter(idx);
  } catch (err) {
    if (!err.message.includes('cancelled')) {
      alert('Error generating audio: ' + err.message);
    }
  } finally {
    state.generating = false;
    hideProgress();
  }
}

async function generateMultipleChapters(indices) {
  state.generating = true;
  const mode = audioModeSelect.value;
  const total = indices.length;
  const needsTranslation = mode === 'translated' || mode === 'bilingual';
  const toTranslate = needsTranslation
    ? indices.filter(i => !state.book.chapters[i].translatedMarkdown)
    : [];
  const toGenerate = indices.filter(i => !state.audioBlobs[i]);

  // Build weighted phases: translation gets weight proportional to chapters needing it
  const phases = [];
  if (toTranslate.length > 0) phases.push({ name: 'translating', weight: 0.3 });
  if (toGenerate.length > 0) phases.push({ name: 'generating', weight: 0.7 });
  if (phases.length === 0) return;
  // If only one phase, give it full weight
  if (phases.length === 1) phases[0].weight = 1.0;

  const tracker = new ProgressTracker(phases);
  tracker.onProgress((s) => {
    progressBar.style.width = `${s.overallPercent}%`;
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
        progressTitle.textContent = `Translating ${i + 1}/${toTranslate.length}: ${ch.title}`;
        resetTranslationState();

        const translated = await translateChapter(ch.markdown, fromLang, toLang, {
          onProgress: (current, paraTotal) => {
            tracker.advance(i + current / paraTotal);
          },
        });
        ch.translatedMarkdown = translated;
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
        progressTitle.textContent = `Generating ${i + 1}/${toGenerate.length}: ${ch.title}`;

        const blob = await generateChapterAudio({
          originalText: ch.markdown,
          translatedText: ch.translatedMarkdown,
          audioMode: mode,
          voiceEn: voiceEnSelect.value,
          voiceZh: voiceZhSelect.value,
          speechRateEn: parseInt(speedEnRange.value),
          speechRateZh: parseInt(speedZhRange.value),
          onProgress: (current, segTotal) => {
            tracker.advance(i + current / segTotal);
          },
        });

        state.audioBlobs[idx] = blob;
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
  const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, f.content);
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `${sanitizeFilename(state.book.title)}_chapters.zip`);
});

btnDownloadAll.addEventListener('click', async () => {
  const blobs = state.audioBlobs;
  if (Object.keys(blobs).length === 0) return;

  const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
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
  progressText.textContent = '';
  progressOverlay.hidden = false;
}

function updateProgress(current, total, text) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = text || `${current} / ${total}`;
}

function hideProgress() {
  progressOverlay.hidden = true;
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
  // First escape all HTML to prevent XSS, then apply markdown rules
  let html = escapeHtml(md)
    .replace(/```([^`]*?)```/gs, '<pre><code>$1</code></pre>')
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Only allow data: and https: image sources after escaping
    .replace(/!\[([^\]]*)\]\((data:[^)]+|https:\/\/[^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // Strip non-safe image URLs
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Strip non-http links
    .replace(/^---+$/gm, '<hr>')
    .replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}
