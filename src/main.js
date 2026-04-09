/**
 * EPUB to Audiobook - Main application.
 *
 * Orchestrates the upload, parsing, markdown conversion, and TTS pipeline.
 */

import { parseEPUB } from './epub-parser.js';
import { htmlToMarkdown, cleanMarkdown } from './html-to-markdown.js';
import { generateChapterAudio, cancelGeneration } from './edge-tts.js';

// State
const state = {
  book: null,           // { title, chapters: [{title, html, markdown}] }
  audioBlobs: {},       // chapterIndex -> Blob
  activeChapter: null,  // currently displayed chapter index
  generating: false,
};

// DOM elements
const uploadScreen = document.getElementById('upload-screen');
const readerScreen = document.getElementById('reader-screen');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const btnBack = document.getElementById('btn-back');
const bookTitleEl = document.getElementById('book-title');
const voiceSelect = document.getElementById('voice-select');
const speedRange = document.getElementById('speed-range');
const speedLabel = document.getElementById('speed-label');
const chapterList = document.getElementById('chapter-list');
const contentPlaceholder = document.getElementById('content-placeholder');
const chapterView = document.getElementById('chapter-view');
const chapterTitle = document.getElementById('chapter-title');
const chapterMarkdown = document.getElementById('chapter-markdown');
const btnGenerateChapter = document.getElementById('btn-generate-chapter');
const btnDownloadChapter = document.getElementById('btn-download-chapter');
const btnDownloadMd = document.getElementById('btn-download-md');
const btnGenerateAll = document.getElementById('btn-generate-all');
const btnDownloadAll = document.getElementById('btn-download-all');
const progressOverlay = document.getElementById('progress-overlay');
const progressTitle = document.getElementById('progress-title');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const btnCancel = document.getElementById('btn-cancel');

// --- Upload handling ---

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.epub')) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});
dropZone.addEventListener('click', (e) => {
  if (e.target.tagName !== 'INPUT') fileInput.click();
});

async function handleFile(file) {
  try {
    dropZone.innerHTML = '<p>Parsing EPUB...</p>';
    const book = await parseEPUB(file);

    // Convert each chapter's HTML to markdown
    for (const ch of book.chapters) {
      const raw = htmlToMarkdown(ch.html);
      ch.markdown = cleanMarkdown(raw);
    }

    state.book = book;
    state.audioBlobs = {};
    state.activeChapter = null;
    showReaderScreen();
  } catch (err) {
    dropZone.innerHTML = `
      <div class="drop-icon">📖</div>
      <p style="color: var(--danger)">Error: ${err.message}</p>
      <p class="or">Try another file</p>
      <label class="file-btn">Choose File<input type="file" id="file-input" accept=".epub" hidden></label>
    `;
    // Re-bind the new file input
    const newInput = dropZone.querySelector('input[type="file"]');
    if (newInput) newInput.addEventListener('change', () => { if (newInput.files[0]) handleFile(newInput.files[0]); });
  }
}

// --- Screen navigation ---

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
  // Reset drop zone
  dropZone.innerHTML = `
    <div class="drop-icon">📖</div>
    <p>Drag & drop an EPUB file here</p>
    <p class="or">or</p>
    <label class="file-btn">Choose File<input type="file" accept=".epub" hidden></label>
  `;
  const newInput = dropZone.querySelector('input[type="file"]');
  if (newInput) newInput.addEventListener('change', () => { if (newInput.files[0]) handleFile(newInput.files[0]); });
});

// --- Speed control ---

speedRange.addEventListener('input', () => {
  const val = speedRange.value;
  speedLabel.textContent = `${val >= 0 ? '+' : ''}${val}%`;
});

// --- Chapter list ---

function renderChapterList() {
  chapterList.innerHTML = '';
  state.book.chapters.forEach((ch, idx) => {
    const li = document.createElement('li');
    li.className = 'chapter-item';
    li.dataset.index = idx;

    const icon = document.createElement('span');
    icon.className = 'status-icon';
    icon.textContent = state.audioBlobs[idx] ? '🔊' : '📄';

    const name = document.createElement('span');
    name.className = 'chapter-name';
    name.textContent = ch.title;
    name.title = ch.title;

    li.appendChild(icon);
    li.appendChild(name);

    li.addEventListener('click', () => selectChapter(idx));
    chapterList.appendChild(li);
  });
  updateDownloadAllButton();
}

function selectChapter(idx) {
  state.activeChapter = idx;
  const ch = state.book.chapters[idx];

  // Update active state in sidebar
  for (const item of chapterList.children) {
    item.classList.toggle('active', parseInt(item.dataset.index) === idx);
  }

  // Show chapter content
  contentPlaceholder.hidden = true;
  chapterView.hidden = false;
  chapterTitle.textContent = ch.title;
  chapterMarkdown.innerHTML = renderMarkdownHtml(ch.markdown);

  // Update button states
  btnDownloadChapter.disabled = !state.audioBlobs[idx];
}

function showPlaceholder() {
  contentPlaceholder.hidden = false;
  chapterView.hidden = true;
}

/**
 * Simple markdown to HTML renderer for display.
 */
function renderMarkdownHtml(md) {
  let html = md
    // Code blocks (must come before other rules)
    .replace(/```([^`]*?)```/gs, '<pre><code>$1</code></pre>')
    // Headings
    .replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
    // Bold and italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // Horizontal rules
    .replace(/^---+$/gm, '<hr>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    // Paragraphs (double newlines)
    .replace(/\n\n+/g, '</p><p>')
    // Single newlines within paragraphs
    .replace(/\n/g, '<br>');

  return `<p>${html}</p>`;
}

// --- Generate single chapter ---

btnGenerateChapter.addEventListener('click', async () => {
  if (state.activeChapter === null || state.generating) return;
  await generateSingleChapter(state.activeChapter);
});

async function generateSingleChapter(idx) {
  const ch = state.book.chapters[idx];
  state.generating = true;
  showProgress(`Generating: ${ch.title}`);

  try {
    const blob = await generateChapterAudio(ch.markdown, {
      voice: voiceSelect.value,
      speechRate: parseInt(speedRange.value),
      onProgress: (current, total) => {
        updateProgress(current, total);
      },
    });

    state.audioBlobs[idx] = blob;
    renderChapterList();
    selectChapter(idx);
  } catch (err) {
    if (err.message !== 'Audio generation cancelled') {
      alert(`Error generating audio: ${err.message}`);
    }
  } finally {
    state.generating = false;
    hideProgress();
  }
}

// --- Generate all chapters ---

btnGenerateAll.addEventListener('click', async () => {
  if (state.generating) return;
  state.generating = true;

  const total = state.book.chapters.length;
  showProgress('Generating All Chapters...');

  try {
    for (let i = 0; i < total; i++) {
      if (state.audioBlobs[i]) {
        // Already generated
        updateProgress(i + 1, total, `Chapter ${i + 1}/${total} (cached)`);
        continue;
      }

      const ch = state.book.chapters[i];
      progressTitle.textContent = `Chapter ${i + 1}/${total}: ${ch.title}`;

      const blob = await generateChapterAudio(ch.markdown, {
        voice: voiceSelect.value,
        speechRate: parseInt(speedRange.value),
        onProgress: (current, paraTotal) => {
          const chapterProgress = current / paraTotal;
          const overallProgress = (i + chapterProgress) / total;
          progressBar.style.width = `${overallProgress * 100}%`;
          progressText.textContent = `Chapter ${i + 1}/${total} — Paragraph ${current}/${paraTotal}`;
        },
      });

      state.audioBlobs[i] = blob;
      renderChapterList();
    }

    updateDownloadAllButton();
  } catch (err) {
    if (err.message !== 'Audio generation cancelled') {
      alert(`Error generating audio: ${err.message}`);
    }
  } finally {
    state.generating = false;
    hideProgress();
  }
});

// --- Download handlers ---

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

btnDownloadAll.addEventListener('click', async () => {
  const chapters = state.book.chapters;
  const blobs = state.audioBlobs;

  // Check if we have all chapters
  const generated = Object.keys(blobs).length;
  if (generated === 0) return;

  // Use JSZip to create a ZIP file
  const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
  const zip = new JSZip();

  for (let i = 0; i < chapters.length; i++) {
    if (blobs[i]) {
      const filename = `${String(i + 1).padStart(3, '0')}_${sanitizeFilename(chapters[i].title)}.mp3`;
      zip.file(filename, blobs[i]);
    }
    // Also include markdown files
    const mdFilename = `${String(i + 1).padStart(3, '0')}_${sanitizeFilename(chapters[i].title)}.md`;
    zip.file(mdFilename, chapters[i].markdown);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(zipBlob, `${sanitizeFilename(state.book.title)}.zip`);
});

// --- Progress UI ---

function showProgress(title) {
  progressTitle.textContent = title;
  progressBar.style.width = '0%';
  progressText.textContent = '';
  progressOverlay.hidden = false;
}

function updateProgress(current, total, text) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  progressBar.style.width = `${pct}%`;
  progressText.textContent = text || `${current} / ${total} paragraphs`;
}

function hideProgress() {
  progressOverlay.hidden = true;
}

btnCancel.addEventListener('click', () => {
  cancelGeneration();
});

// --- Utilities ---

function updateDownloadAllButton() {
  const generated = Object.keys(state.audioBlobs).length;
  btnDownloadAll.disabled = generated === 0;
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

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*!]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50)
    .replace(/-+$/, '') || 'untitled';
}
