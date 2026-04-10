/**
 * EPUB parser - extracts chapters from EPUB files in the browser.
 *
 * EPUBs are ZIP archives containing XHTML documents. We use JSZip to
 * unzip, then parse the OPF manifest and spine to get reading order,
 * and the NCX/NAV TOC for chapter titles.
 *
 * Inspired by tepub's extraction pipeline and EasyOriginals' EPUB.js usage.
 */

/**
 * Parse an EPUB file and extract chapters with their HTML content.
 *
 * @param {File} file - The EPUB file to parse.
 * @returns {Promise<{title: string, chapters: Array<{title: string, html: string}>}>}
 */
export async function parseEPUB(file) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  // 1. Find the OPF file via container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl?.getAttribute('full-path');
  if (!opfPath) throw new Error('Invalid EPUB: no rootfile found');

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // 2. Parse the OPF file
  const opfXml = await zip.file(opfPath)?.async('text');
  if (!opfXml) throw new Error('Invalid EPUB: missing OPF file');

  const opfDoc = parser.parseFromString(opfXml, 'application/xml');

  // Extract book title — try namespace-aware query first for dc:title
  const titleEl = opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title')[0]
    || opfDoc.querySelector('metadata title');
  const bookTitle = titleEl?.textContent?.trim() || file.name.replace(/\.epub$/i, '');

  // 3. Build manifest lookup (id -> href)
  const manifest = {};
  for (const item of opfDoc.querySelectorAll('manifest item')) {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type');
    if (id && href) {
      manifest[id] = { href, mediaType };
    }
  }

  // 4. Get spine reading order
  const spineItems = [];
  for (const itemref of opfDoc.querySelectorAll('spine itemref')) {
    const idref = itemref.getAttribute('idref');
    if (idref && manifest[idref]) {
      spineItems.push(manifest[idref].href);
    }
  }

  // 5. Try to parse TOC for chapter titles
  const tocTitles = await parseTOC(zip, opfDoc, opfDir, parser);

  // 6. Build a map of spine href -> TOC title
  // TOC hrefs are already resolved to be relative to the OPF directory (opfDir)
  // so they can be directly compared with spine hrefs.
  const hrefToTitle = {};
  for (const entry of tocTitles) {
    const baseHref = entry.href.split('#')[0];
    if (!hrefToTitle[baseHref]) {
      hrefToTitle[baseHref] = entry.title;
    }
  }

  // 7. Extract chapter content
  const chapters = [];
  for (let i = 0; i < spineItems.length; i++) {
    const href = spineItems[i];
    const fullPath = opfDir + href;
    const zipEntry = zip.file(fullPath);
    if (!zipEntry) continue;

    const html = await zipEntry.async('text');
    const title = hrefToTitle[href] || `Chapter ${i + 1}`;

    // Resolve images to data URLs
    const processedHtml = await resolveImages(html, opfDir + href, zip);

    chapters.push({ title, href, html: processedHtml });
  }

  // 8. Merge chapters that share the same TOC title (multi-file chapters)
  const merged = mergeChapters(chapters, hrefToTitle);

  return { title: bookTitle, chapters: merged };
}

/**
 * Parse TOC from NCX or NAV document.
 */
async function parseTOC(zip, opfDoc, opfDir, parser) {
  const entries = [];

  // Try NAV (EPUB3) first
  const navItem = opfDoc.querySelector('manifest item[properties~="nav"]');
  if (navItem) {
    const navRelHref = navItem.getAttribute('href');
    const navFullPath = opfDir + navRelHref;
    const navDir = dirOf(navFullPath);
    const navXml = await zip.file(navFullPath)?.async('text');
    if (navXml) {
      const navDoc = parser.parseFromString(navXml, 'application/xhtml+xml');
      const navEl = navDoc.querySelector('nav[*|type="toc"], nav.toc, nav');
      if (navEl) {
        for (const a of navEl.querySelectorAll('a[href]')) {
          const rawHref = a.getAttribute('href');
          // Resolve href relative to the NAV file, then make relative to opfDir
          const resolvedHref = resolveRelativePath(navDir, rawHref);
          const relToOpf = opfDir && resolvedHref.startsWith(opfDir)
            ? resolvedHref.substring(opfDir.length)
            : resolvedHref;
          entries.push({
            title: a.textContent.trim(),
            href: relToOpf,
          });
        }
        if (entries.length > 0) return entries;
      }
    }
  }

  // Fallback to NCX (EPUB2)
  const ncxItem = Array.from(opfDoc.querySelectorAll('manifest item')).find(
    item => item.getAttribute('media-type') === 'application/x-dtbncx+xml'
  );
  if (ncxItem) {
    const ncxRelHref = ncxItem.getAttribute('href');
    const ncxFullPath = opfDir + ncxRelHref;
    const ncxDir = dirOf(ncxFullPath);
    const ncxXml = await zip.file(ncxFullPath)?.async('text');
    if (ncxXml) {
      const ncxDoc = parser.parseFromString(ncxXml, 'application/xml');
      for (const navPoint of ncxDoc.querySelectorAll('navPoint')) {
        const text = navPoint.querySelector('navLabel text')?.textContent?.trim();
        const src = navPoint.querySelector('content')?.getAttribute('src');
        if (text && src) {
          // Resolve href relative to the NCX file, then make relative to opfDir
          const resolvedHref = resolveRelativePath(ncxDir, src);
          const relToOpf = opfDir && resolvedHref.startsWith(opfDir)
            ? resolvedHref.substring(opfDir.length)
            : resolvedHref;
          entries.push({ title: text, href: relToOpf });
        }
      }
    }
  }

  return entries;
}

/**
 * Resolve image src attributes in HTML to base64 data URLs.
 */
async function resolveImages(html, docPath, zip) {
  const docDir = dirOf(docPath);

  // Find all image src references
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  const replacements = [];

  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1];
    if (src.startsWith('data:')) continue;

    // Resolve relative path against the document's directory
    const imgPath = resolveRelativePath(docDir, src);
    const imgFile = zip.file(imgPath);
    if (imgFile) {
      const blob = await imgFile.async('base64');
      const ext = src.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png'
        : ext === 'svg' ? 'image/svg+xml'
        : ext === 'gif' ? 'image/gif'
        : 'image/jpeg';
      replacements.push({ original: src, dataUrl: `data:${mime};base64,${blob}` });
    }
  }

  // Replace only inside src="..." attributes to avoid rewriting unrelated text
  let result = html;
  for (const r of replacements) {
    result = result
      .replaceAll(`src="${r.original}"`, `src="${r.dataUrl}"`)
      .replaceAll(`src='${r.original}'`, `src='${r.dataUrl}'`);
  }
  return result;
}

/**
 * Get the directory portion of a path (everything up to and including the last /).
 * Returns '' if there is no directory component.
 */
function dirOf(path) {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.substring(0, idx + 1) : '';
}

/**
 * Resolve a relative path against a base directory path.
 * basePath should be a directory (ending with / or empty string), not a file path.
 */
function resolveRelativePath(baseDir, relativePath) {
  if (relativePath.startsWith('/')) return relativePath.substring(1);

  // baseDir already points to the directory, so we just append and normalize
  const combined = baseDir + relativePath;
  const parts = [];
  for (const segment of combined.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '' && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

/**
 * Merge spine items that share the same TOC entry into single chapters.
 */
function mergeChapters(chapters, hrefToTitle) {
  if (chapters.length === 0) return chapters;

  const merged = [];
  let current = null;

  for (const ch of chapters) {
    const tocTitle = hrefToTitle[ch.href];
    if (current && tocTitle && current.title === tocTitle) {
      // Same chapter, merge HTML
      current.html += '\n' + ch.html;
    } else {
      if (current) merged.push(current);
      current = { ...ch };
    }
  }
  if (current) merged.push(current);

  return merged;
}
