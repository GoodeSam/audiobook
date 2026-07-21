/**
 * DOC parser — extracts text from legacy binary Word documents (.doc)
 * entirely in the browser.
 *
 * A .doc file is an OLE2 Compound File Binary (CFB) container. The text
 * lives in the WordDocument stream, addressed by a piece table (CLX/PlcPcd)
 * stored in the 0Table/1Table stream. Each piece is either 8-bit
 * Windows-1252 or 16-bit UTF-16LE. Older Word 6/95 files without a piece
 * table store text contiguously at fcMin.
 *
 * Formatting (headings, bold) is not stored with the text, so chapters are
 * detected heuristically from "Chapter N" / 第N章 style lines.
 */

// ── CFB (OLE2 compound file) ──

function parseCFB(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 512 ||
      dv.getUint32(0, true) !== 0xe011cfd0 || dv.getUint32(4, true) !== 0xe11ab1a1) {
    throw new Error('Not an OLE2 compound file (invalid .doc)');
  }
  const sectorShift = dv.getUint16(0x1e, true);
  const sectorSize = 1 << sectorShift;
  const miniShift = dv.getUint16(0x20, true);
  const miniSize = 1 << miniShift;
  const firstDirSector = dv.getUint32(0x30, true);
  const miniCutoff = dv.getUint32(0x38, true);
  const firstMiniFatSector = dv.getUint32(0x3c, true);
  const firstDifatSector = dv.getUint32(0x44, true);
  const numDifatSectors = dv.getUint32(0x48, true);

  const FREESECT = 0xffffffff;
  const ENDOFCHAIN = 0xfffffffe;
  const sectorOffset = (s) => (s + 1) << sectorShift;
  const entriesPerSector = sectorSize / 4;
  // Upper bound on any sector-chain walk: a sector can't legitimately be
  // visited twice, so this caps both iteration count and cycles.
  const maxSectors = Math.max(1, Math.floor(buf.byteLength / sectorSize));

  // DIFAT: 109 header entries + optional chained DIFAT sectors
  const difat = [];
  for (let i = 0; i < 109; i++) {
    const v = dv.getUint32(0x4c + i * 4, true);
    if (v !== FREESECT) difat.push(v);
  }
  let difatSector = firstDifatSector;
  const visitedDifatSectors = new Set();
  for (let i = 0; i < numDifatSectors && i < maxSectors && difatSector < 0xfffffffa; i++) {
    if (visitedDifatSectors.has(difatSector) || sectorOffset(difatSector) + sectorSize > buf.byteLength) break;
    visitedDifatSectors.add(difatSector);
    const base = sectorOffset(difatSector);
    for (let j = 0; j < entriesPerSector - 1; j++) {
      const v = dv.getUint32(base + j * 4, true);
      if (v !== FREESECT) difat.push(v);
    }
    difatSector = dv.getUint32(base + (entriesPerSector - 1) * 4, true);
  }

  // FAT
  const fat = [];
  for (const fatSector of difat) {
    const base = sectorOffset(fatSector);
    for (let j = 0; j < entriesPerSector; j++) {
      fat.push(dv.getUint32(base + j * 4, true));
    }
  }

  function readChain(start, byteLength) {
    const parts = [];
    let s = start;
    let remaining = byteLength ?? Infinity;
    const visited = new Set();
    while (s < 0xfffffffa && s !== ENDOFCHAIN && remaining > 0 && visited.size < maxSectors) {
      if (visited.has(s)) break; // cycle in the FAT chain
      visited.add(s);
      const off = sectorOffset(s);
      if (off >= buf.byteLength) break;
      const take = Math.min(sectorSize, remaining);
      parts.push(new Uint8Array(buf, off, Math.min(take, buf.byteLength - off)));
      remaining -= take;
      s = fat[s];
      if (s === undefined) break;
    }
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  // Directory entries
  const dirBytes = readChain(firstDirSector);
  const entries = [];
  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const d = new DataView(dirBytes.buffer, dirBytes.byteOffset + off, 128);
    const nameLen = d.getUint16(0x40, true);
    if (nameLen === 0) continue;
    let name = '';
    for (let i = 0; i < nameLen - 2; i += 2) name += String.fromCharCode(d.getUint16(i, true));
    entries.push({
      name,
      type: d.getUint8(0x42),
      startSector: d.getUint32(0x74, true),
      size: d.getUint32(0x78, true),
    });
  }

  const root = entries.find(e => e.type === 5);
  const miniStreamBytes = root ? readChain(root.startSector, root.size) : new Uint8Array(0);

  // MiniFAT
  const miniFatBytes = firstMiniFatSector < 0xfffffffa ? readChain(firstMiniFatSector) : new Uint8Array(0);
  const miniFat = [];
  const mdv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) miniFat.push(mdv.getUint32(i, true));

  function readMiniChain(start, byteLength) {
    const out = new Uint8Array(byteLength);
    let s = start, off = 0, guard = 0;
    while (s < 0xfffffffa && s !== ENDOFCHAIN && off < byteLength && guard++ < 1e6) {
      const take = Math.min(miniSize, byteLength - off);
      out.set(miniStreamBytes.subarray(s * miniSize, s * miniSize + take), off);
      off += take;
      s = miniFat[s];
      if (s === undefined) break;
    }
    return out;
  }

  return {
    getStream(name) {
      const e = entries.find(en => en.name === name && en.type === 2);
      if (!e) return null;
      return e.size < miniCutoff ? readMiniChain(e.startSector, e.size) : readChain(e.startSector, e.size);
    },
  };
}

// ── MS-DOC text extraction ──

/**
 * Extract the main document text from a .doc file's bytes.
 * Paragraph marks are '\r' in the returned string.
 *
 * @param {ArrayBuffer} buf
 * @returns {string}
 */
export function extractDocText(buf) {
  const cfb = parseCFB(buf);
  const wd = cfb.getStream('WordDocument');
  if (!wd) throw new Error('Invalid .doc: WordDocument stream not found');
  const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);

  if (dv.getUint16(0, true) !== 0xa5ec) {
    throw new Error('Invalid .doc: unrecognized Word file identifier');
  }

  const flags = dv.getUint16(0x000a, true);
  const tableName = (flags & 0x0200) ? '1Table' : '0Table';
  const ccpText = dv.getInt32(0x004c, true);
  const fcClx = dv.getUint32(0x01a2, true);
  const lcbClx = dv.getUint32(0x01a6, true);

  const cp1252 = new TextDecoder('windows-1252');
  const utf16 = new TextDecoder('utf-16le');

  const table = cfb.getStream(tableName);
  let plcPcd = null;
  if (table && lcbClx > 0 && fcClx + lcbClx <= table.length) {
    // CLX: optional Prc blocks (0x01), then Pcdt (0x02) holding the PlcPcd
    const tdv = new DataView(table.buffer, table.byteOffset, table.byteLength);
    let pos = fcClx;
    const end = fcClx + lcbClx;
    while (pos < end) {
      const tag = tdv.getUint8(pos);
      if (tag === 0x01) {
        pos += 3 + tdv.getUint16(pos + 1, true);
      } else if (tag === 0x02) {
        plcPcd = { start: pos + 5, size: tdv.getUint32(pos + 1, true), tdv };
        break;
      } else {
        break;
      }
    }
  }

  let text = '';
  if (plcPcd) {
    const { start, size, tdv } = plcPcd;
    const n = Math.floor((size - 4) / 12); // piece count: (n+1) CPs + n 8-byte PCDs
    const cps = [];
    for (let i = 0; i <= n; i++) cps.push(tdv.getInt32(start + i * 4, true));
    const pcdBase = start + (n + 1) * 4;
    for (let i = 0; i < n && text.length < ccpText; i++) {
      let len = cps[i + 1] - cps[i];
      if (len <= 0) continue;
      len = Math.min(len, ccpText - text.length);
      const fcRaw = tdv.getUint32(pcdBase + i * 8 + 2, true);
      const compressed = (fcRaw & 0x40000000) !== 0;
      const fc = compressed ? (fcRaw & 0x3fffffff) >>> 1 : (fcRaw & 0x3fffffff);
      if (compressed) {
        text += cp1252.decode(wd.subarray(fc, fc + len));
      } else {
        text += utf16.decode(wd.subarray(fc, fc + len * 2));
      }
    }
  } else {
    // Word 6/95 fallback: contiguous 8-bit text starting at fcMin
    const fcMin = dv.getUint32(0x0018, true);
    text = cp1252.decode(wd.subarray(fcMin, fcMin + ccpText));
  }

  return cleanDocText(text);
}

/**
 * Clean raw .doc text: resolve field codes, normalize breaks, strip
 * control characters. Keeps '\r' as the paragraph separator.
 */
export function cleanDocText(text) {
  let out = '';
  let fieldDepth = 0;      // inside field code (between 0x13 and 0x14)
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 0x13) { fieldDepth++; continue; }        // field begin
    if (code === 0x14) { if (fieldDepth > 0) fieldDepth--; continue; } // separator → keep result text
    if (code === 0x15) { continue; }                       // field end
    if (fieldDepth > 0) continue;                          // skip field instructions
    if (code === 0x0d) { out += '\r'; continue; }          // paragraph mark
    if (code === 0x0b) { out += '\n'; continue; }          // line break
    if (code === 0x07) { out += ' '; continue; }           // table cell/row mark
    if (code === 0x1e) { out += '-'; continue; }           // non-breaking hyphen
    if (code === 0x1f) { continue; }                       // optional hyphen
    if (code === 0xa0) { out += ' '; continue; }           // nbsp
    if (code < 0x20 && code !== 0x09) continue;            // other control chars
    out += ch;
  }
  return out;
}

// ── Chapter grouping ──

const HEADING_PATTERNS = [
  /^(chapter|part|section|book)\s+([0-9]+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
  /^第\s*[0-9〇零一二三四五六七八九十百千]{1,7}\s*[章节回部篇讲课]/,
  /^(prologue|epilogue|introduction|preface|foreword|appendix|conclusion)\b/i,
  /^(前言|序言|序章|引言|后记|尾声|附录|目录|结语)$/,
];

/** Heuristic: does this paragraph look like a chapter heading? */
export function isHeadingLine(line) {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  return HEADING_PATTERNS.some(re => re.test(t));
}

/**
 * Convert cleaned .doc text into chapters.
 * @param {string} text - Cleaned text with '\r' paragraph marks.
 * @param {string} bookTitle
 * @returns {Array<{title: string, markdown: string}>}
 */
export function docTextToChapters(text, bookTitle) {
  const paragraphs = text
    .split('\r')
    .map(p => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0);

  if (paragraphs.length === 0) {
    return [{ title: bookTitle, markdown: '' }];
  }

  const hasHeadings = paragraphs.some(isHeadingLine);
  if (!hasHeadings) {
    return [{ title: bookTitle, markdown: paragraphs.join('\n\n') }];
  }

  const chapters = [];
  let current = null;
  for (const p of paragraphs) {
    if (isHeadingLine(p)) {
      if (current) chapters.push(current);
      current = { title: p, markdown: `# ${p}` };
    } else {
      if (!current) current = { title: bookTitle, markdown: '' };
      current.markdown += (current.markdown ? '\n\n' : '') + p;
    }
  }
  if (current) chapters.push(current);
  return chapters;
}

/**
 * Parse a legacy .doc file into the app's book shape.
 *
 * @param {File} file
 * @returns {Promise<{title: string, chapters: Array<{title: string, markdown: string}>}>}
 */
export async function parseDOC(file) {
  const buf = await file.arrayBuffer();
  const text = extractDocText(buf);
  const bookTitle = file.name.replace(/\.doc$/i, '');
  return { title: bookTitle, chapters: docTextToChapters(text, bookTitle) };
}
