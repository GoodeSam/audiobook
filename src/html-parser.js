/**
 * HTML parser — extracts chapters from .html files.
 *
 * Splits the HTML document at the top-level heading tag to create chapters,
 * then converts each section to Markdown using the shared htmlToMarkdown utility.
 */

import { htmlToMarkdown } from './html-to-markdown.js';

/**
 * Parse an HTML file and extract chapters with Markdown content.
 *
 * @param {File} file - The HTML file to parse.
 * @returns {Promise<{title: string, chapters: Array<{title: string, markdown: string}>}>}
 */
export async function parseHTML(file) {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  const bookTitle =
    doc.querySelector('title')?.textContent?.trim() ||
    doc.querySelector('h1')?.textContent?.trim() ||
    file.name.replace(/\.html?$/i, '');

  const body = doc.body;
  if (!body || !body.textContent.trim()) {
    return { title: bookTitle, chapters: [{ title: bookTitle, markdown: '' }] };
  }

  const chapters = splitIntoChapters(body, bookTitle);
  return { title: bookTitle, chapters };
}

/**
 * Split a <body> element into chapters at the top-level heading.
 */
function splitIntoChapters(body, bookTitle) {
  const HEADING_TAGS = new Set(['H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const children = Array.from(body.children);

  // Determine the dominant heading level for chapter splits
  const levels = children
    .filter(el => HEADING_TAGS.has(el.tagName))
    .map(el => parseInt(el.tagName[1]));

  if (levels.length === 0) {
    return [{ title: bookTitle, markdown: htmlToMarkdown(body.innerHTML) }];
  }

  const splitLevel = Math.min(...levels);
  const splitTag = `H${splitLevel}`;

  const chapters = [];
  let currentTitle = null;
  let currentNodes = [];

  const flush = () => {
    const md = nodesToMarkdown(currentNodes);
    if (md.trim() || currentTitle !== null) {
      chapters.push({ title: currentTitle ?? bookTitle, markdown: md });
    }
    currentNodes = [];
  };

  for (const el of children) {
    if (el.tagName === splitTag) {
      flush();
      currentTitle = el.textContent.trim() || 'Chapter';
    } else {
      currentNodes.push(el);
    }
  }
  flush();

  return chapters.length > 0
    ? chapters
    : [{ title: bookTitle, markdown: htmlToMarkdown(body.innerHTML) }];
}

function nodesToMarkdown(nodes) {
  if (nodes.length === 0) return '';
  const wrapper = document.createElement('div');
  for (const node of nodes) wrapper.appendChild(node.cloneNode(true));
  return htmlToMarkdown(wrapper.innerHTML);
}
