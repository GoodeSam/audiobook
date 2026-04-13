/**
 * DOCX parser — extracts text from Word documents in the browser.
 *
 * DOCX files are ZIP archives containing XML. The main content lives in
 * word/document.xml as a series of <w:p> (paragraph) elements. We use
 * JSZip (already a dependency) to unzip, then parse the XML to extract
 * styled text and convert it to Markdown with chapter grouping.
 */

const HEADING_STYLES = {
  'Heading1': 1, 'heading 1': 1, 'Heading11': 1,
  'Heading2': 2, 'heading 2': 2, 'Heading21': 2,
  'Heading3': 3, 'heading 3': 3, 'Heading31': 3,
  'Heading4': 4, 'heading 4': 4,
  'Heading5': 5, 'heading 5': 5,
  'Heading6': 6, 'heading 6': 6,
  'Title': 1, 'Subtitle': 2,
};

/**
 * Parse a DOCX file and extract chapters with Markdown content.
 *
 * @param {File} file - The DOCX file to parse.
 * @returns {Promise<{title: string, chapters: Array<{title: string, markdown: string}>}>}
 */
export async function parseDOCX(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  const docXml = await zip.file('word/document.xml')?.async('text');
  if (!docXml) throw new Error('Invalid DOCX: missing word/document.xml');

  // Parse numbering definitions for list detection
  const numberingMap = await parseNumbering(zip);

  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, 'application/xml');

  const body = doc.getElementsByTagName('w:body')[0];
  if (!body) throw new Error('Invalid DOCX: no document body found');

  const bookTitle = file.name.replace(/\.docx$/i, '');

  // Extract paragraphs as markdown lines with heading level info
  const paragraphs = [];
  for (const node of body.childNodes) {
    if (node.nodeName === 'w:p') {
      const result = parseParagraph(node, numberingMap);
      if (result) paragraphs.push(result);
    } else if (node.nodeName === 'w:tbl') {
      const table = parseTable(node, numberingMap);
      if (table) paragraphs.push({ text: table, headingLevel: 0 });
    }
  }

  // Group paragraphs into chapters based on top-level headings
  const chapters = groupIntoChapters(paragraphs, bookTitle);

  return { title: bookTitle, chapters };
}

/**
 * Parse numbering.xml for list style detection.
 */
async function parseNumbering(zip) {
  const numXml = await zip.file('word/numbering.xml')?.async('text');
  if (!numXml) return {};

  const parser = new DOMParser();
  const doc = parser.parseFromString(numXml, 'application/xml');
  const map = {};

  for (const abstractNum of doc.getElementsByTagName('w:abstractNum')) {
    const abstractId = abstractNum.getAttribute('w:abstractNumId');
    const levels = {};
    for (const lvl of abstractNum.getElementsByTagName('w:lvl')) {
      const ilvl = lvl.getAttribute('w:ilvl');
      const numFmt = lvl.getElementsByTagName('w:numFmt')[0]?.getAttribute('w:val');
      levels[ilvl] = numFmt === 'bullet' ? 'bullet' : 'decimal';
    }
    map[`abstract_${abstractId}`] = levels;
  }

  // Map numId -> abstractNumId
  for (const num of doc.getElementsByTagName('w:num')) {
    const numId = num.getAttribute('w:numId');
    const abstractRef = num.getElementsByTagName('w:abstractNumId')[0]?.getAttribute('w:val');
    if (abstractRef && map[`abstract_${abstractRef}`]) {
      map[numId] = map[`abstract_${abstractRef}`];
    }
  }

  return map;
}

/**
 * Parse a single <w:p> element into a markdown line.
 */
function parseParagraph(pNode, numberingMap) {
  const pPr = pNode.getElementsByTagName('w:pPr')[0];
  let headingLevel = 0;
  let listPrefix = '';

  if (pPr) {
    // Check for heading style
    const pStyle = pPr.getElementsByTagName('w:pStyle')[0];
    const styleVal = pStyle?.getAttribute('w:val') || '';
    headingLevel = HEADING_STYLES[styleVal] || 0;

    // Check for outline level (alternative heading detection)
    if (!headingLevel) {
      const outlineLvl = pPr.getElementsByTagName('w:outlineLvl')[0];
      if (outlineLvl) {
        const lvl = parseInt(outlineLvl.getAttribute('w:val'));
        if (lvl >= 0 && lvl <= 5) headingLevel = lvl + 1;
      }
    }

    // Check for list numbering
    const numPr = pPr.getElementsByTagName('w:numPr')[0];
    if (numPr) {
      const numId = numPr.getElementsByTagName('w:numId')[0]?.getAttribute('w:val');
      const ilvl = numPr.getElementsByTagName('w:ilvl')[0]?.getAttribute('w:val') || '0';
      const indent = '  '.repeat(parseInt(ilvl));
      const numDef = numberingMap[numId];
      const listType = numDef?.[ilvl] || 'bullet';
      listPrefix = indent + (listType === 'bullet' ? '- ' : '1. ');
    }
  }

  // Extract text from runs
  const textParts = [];
  for (const run of pNode.getElementsByTagName('w:r')) {
    const rPr = run.getElementsByTagName('w:rPr')[0];
    const isBold = rPr && rPr.getElementsByTagName('w:b').length > 0;
    const isItalic = rPr && rPr.getElementsByTagName('w:i').length > 0;

    let runText = '';
    for (const child of run.childNodes) {
      if (child.nodeName === 'w:t') {
        runText += child.textContent;
      } else if (child.nodeName === 'w:br') {
        runText += '\n';
      } else if (child.nodeName === 'w:tab') {
        runText += '\t';
      }
    }

    if (!runText) continue;

    if (isBold && isItalic) runText = `***${runText}***`;
    else if (isBold) runText = `**${runText}**`;
    else if (isItalic) runText = `*${runText}*`;

    textParts.push(runText);
  }

  const text = textParts.join('').trim();
  if (!text) return null;

  if (headingLevel > 0) {
    return { text: `${'#'.repeat(headingLevel)} ${text}`, headingLevel };
  }

  return { text: listPrefix + text, headingLevel: 0 };
}

/**
 * Parse a <w:tbl> element into a markdown table.
 */
function parseTable(tblNode, numberingMap) {
  const rows = [];
  for (const tr of tblNode.getElementsByTagName('w:tr')) {
    const cells = [];
    for (const tc of tr.getElementsByTagName('w:tc')) {
      const cellParts = [];
      for (const p of tc.getElementsByTagName('w:p')) {
        const result = parseParagraph(p, numberingMap);
        if (result) cellParts.push(result.text);
      }
      cells.push(cellParts.join(' ').replace(/\|/g, '\\|'));
    }
    rows.push(cells);
  }

  if (rows.length === 0) return null;

  const maxCols = Math.max(...rows.map(r => r.length));
  for (const row of rows) {
    while (row.length < maxCols) row.push('');
  }

  let md = '| ' + rows[0].join(' | ') + ' |\n';
  md += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
  for (let i = 1; i < rows.length; i++) {
    md += '| ' + rows[i].join(' | ') + ' |\n';
  }
  return md;
}

/**
 * Group parsed paragraphs into chapters based on heading structure.
 */
function groupIntoChapters(paragraphs, bookTitle) {
  if (paragraphs.length === 0) {
    return [{ title: bookTitle, markdown: '' }];
  }

  // Find the top-level heading level used in the document
  const headingLevels = paragraphs
    .filter(p => p.headingLevel > 0)
    .map(p => p.headingLevel);

  if (headingLevels.length === 0) {
    // No headings — return all content as a single chapter
    return [{
      title: bookTitle,
      markdown: paragraphs.map(p => p.text).join('\n\n'),
    }];
  }

  const splitLevel = Math.min(...headingLevels);
  const chapters = [];
  let current = null;

  for (const p of paragraphs) {
    if (p.headingLevel === splitLevel) {
      if (current) chapters.push(current);
      // Strip the heading prefix for the title
      const title = p.text.replace(/^#+\s*/, '');
      current = { title, markdown: '' };
    } else {
      if (!current) {
        // Content before first heading — create a preamble chapter
        current = { title: bookTitle, markdown: '' };
      }
      current.markdown += (current.markdown ? '\n\n' : '') + p.text;
    }
  }
  if (current) chapters.push(current);

  return chapters;
}
