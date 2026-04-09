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

// ── State ──

const state = {
  book: null,                // { title, chapters: [{title, html, markdown, translatedMarkdown?}] }
  audioBlobs: {},            // chapterIndex -> Blob
  activeChapter: null,       // currently displayed chapter index
  activeTab: 'original',    // 'original' | 'translated'
  generating: false,
  selectedChapters: new Set(),
};

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

// Use event delegation so it works after innerHTML replacements
dropZone.addEventListener('change', (e) => {
  if (e.target.type === 'file' && e.target.files[0]) handleFile(e.target.files[0]);
});
dropZone.addEventListener('click', (e) => {
  if (e.target.tagName !== 'INPUT') {
    const input = getFileInput();
    if (input) input.click();
  }
});

async function handleFile(file) {
  try {
    dropZone.innerHTML = '<p>Parsing EPUB...</p>';
    const book = await parseEPUB(file);

    for (const ch of book.chapters) {
      ch.markdown = cleanMarkdown(htmlToMarkdown(ch.html));
      ch.translatedMarkdown = null;
    }

    state.book = book;
    state.audioBlobs = {};
    state.activeChapter = null;
    state.selectedChapters = new Set();

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
  const fromLang = detectSourceLang(toLang);
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
  const fromLang = detectSourceLang(toLang);
  const total = indices.length;

  showProgress('Translating chapters...');

  try {
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const ch = state.book.chapters[idx];

      if (ch.translatedMarkdown) {
        updateProgress(i + 1, total, `Chapter ${i + 1}/${total} (cached)`);
        continue;
      }

      progressTitle.textContent = `Translating ${i + 1}/${total}: ${ch.title}`;
      resetTranslationState();

      const translated = await translateChapter(ch.markdown, fromLang, toLang, {
        onProgress: (current, paraTotal) => {
          const chapterPct = current / paraTotal;
          const overallPct = ((i + chapterPct) / total) * 100;
          progressBar.style.width = `${overallPct}%`;
          progressText.textContent = `Chapter ${i + 1}/${total} — Paragraph ${current}/${paraTotal}`;
        },
      });

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

function detectSourceLang(targetLang) {
  // If translating to Chinese, source is English and vice versa
  if (targetLang.startsWith('zh')) return 'en';
  return 'en'; // Default source is English; Microsoft auto-detects anyway
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

  showProgress('Generating chapters...');

  try {
    // Phase 1: Translate any that need it
    if (needsTranslation) {
      const toTranslate = indices.filter(i => !state.book.chapters[i].translatedMarkdown);
      if (toTranslate.length > 0) {
        progressTitle.textContent = 'Translating chapters...';
        const toLang = translateLangSelect.value;
        const fromLang = detectSourceLang(toLang);

        for (let i = 0; i < toTranslate.length; i++) {
          const idx = toTranslate[i];
          const ch = state.book.chapters[idx];
          progressTitle.textContent = `Translating ${i + 1}/${toTranslate.length}: ${ch.title}`;
          resetTranslationState();

          const translated = await translateChapter(ch.markdown, fromLang, toLang, {
            onProgress: (current, paraTotal) => {
              const pct = ((i + current / paraTotal) / toTranslate.length) * 30; // 30% of total
              progressBar.style.width = `${pct}%`;
              progressText.textContent = `Translating ${i + 1}/${toTranslate.length}: paragraph ${current}/${paraTotal}`;
            },
          });
          ch.translatedMarkdown = translated;
          renderChapterList();
        }
      }
    }

    // Phase 2: Generate audio
    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i];
      const ch = state.book.chapters[idx];

      if (state.audioBlobs[idx]) {
        const pct = 30 + ((i + 1) / total) * 70;
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `Chapter ${i + 1}/${total} (cached)`;
        continue;
      }

      progressTitle.textContent = `Generating ${i + 1}/${total}: ${ch.title}`;

      const blob = await generateChapterAudio({
        originalText: ch.markdown,
        translatedText: ch.translatedMarkdown,
        audioMode: mode,
        voiceEn: voiceEnSelect.value,
        voiceZh: voiceZhSelect.value,
        speechRateEn: parseInt(speedEnRange.value),
        speechRateZh: parseInt(speedZhRange.value),
        onProgress: (current, segTotal) => {
          const chapterPct = current / segTotal;
          const overallPct = 30 + ((i + chapterPct) / total) * 70;
          progressBar.style.width = `${overallPct}%`;
          progressText.textContent = `Chapter ${i + 1}/${total} — Segment ${current}/${segTotal}`;
        },
      });

      state.audioBlobs[idx] = blob;
      renderChapterList();
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
 * Simple markdown to HTML renderer for display.
 */
function renderMarkdownHtml(md) {
  let html = md
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
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^---+$/gm, '<hr>')
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}
