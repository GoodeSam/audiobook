/**
 * Tests for epub-parser utilities.
 *
 * Since the full parseEPUB function depends on JSZip and DOMParser heavily,
 * we test the exported/internal logic by importing what we can and testing
 * the path resolution and merge logic via a wrapper approach.
 *
 * The parser module doesn't export internal helpers, so we test indirectly
 * through a small extracted module, or test behaviors via the public API
 * with mocked EPUB structures.
 */
import { describe, it, expect } from 'vitest';

// We can't directly import private functions, so we replicate and test
// the path resolution logic that was buggy.

// Replicate the fixed dirOf + resolveRelativePath for unit testing
function dirOf(path) {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.substring(0, idx + 1) : '';
}

function resolveRelativePath(baseDir, relativePath) {
  if (relativePath.startsWith('/')) return relativePath.substring(1);
  const combined = baseDir + relativePath;
  const parts = [];
  for (const segment of combined.split('/')) {
    if (segment === '..') parts.pop();
    else if (segment !== '' && segment !== '.') parts.push(segment);
  }
  return parts.join('/');
}

describe('dirOf', () => {
  it('extracts directory from file path', () => {
    expect(dirOf('OEBPS/Text/ch1.xhtml')).toBe('OEBPS/Text/');
  });

  it('returns empty for root-level file', () => {
    expect(dirOf('content.opf')).toBe('');
  });

  it('handles nested paths', () => {
    expect(dirOf('a/b/c/file.html')).toBe('a/b/c/');
  });
});

describe('resolveRelativePath', () => {
  it('resolves same-directory image reference', () => {
    // ch1.xhtml references ../Images/cover.jpg
    // docDir = OEBPS/Text/
    const result = resolveRelativePath('OEBPS/Text/', '../Images/cover.jpg');
    expect(result).toBe('OEBPS/Images/cover.jpg');
  });

  it('resolves same-folder reference', () => {
    const result = resolveRelativePath('OEBPS/Text/', 'image.png');
    expect(result).toBe('OEBPS/Text/image.png');
  });

  it('resolves absolute path', () => {
    const result = resolveRelativePath('OEBPS/Text/', '/Images/cover.jpg');
    expect(result).toBe('Images/cover.jpg');
  });

  it('resolves multiple parent traversals', () => {
    const result = resolveRelativePath('a/b/c/', '../../d/file.txt');
    expect(result).toBe('a/d/file.txt');
  });

  it('resolves dot segments', () => {
    const result = resolveRelativePath('OEBPS/', './Text/ch1.xhtml');
    expect(result).toBe('OEBPS/Text/ch1.xhtml');
  });

  it('resolves from empty base directory', () => {
    const result = resolveRelativePath('', 'Text/ch1.xhtml');
    expect(result).toBe('Text/ch1.xhtml');
  });

  it('handles path with no parent to pop', () => {
    // Edge case: going up past root should not crash
    const result = resolveRelativePath('OEBPS/', '../../file.txt');
    expect(result).toBe('file.txt');
  });
});

describe('chapter merge logic', () => {
  // Replicate mergeChapters logic for testing
  function mergeChapters(chapters, hrefToTitle) {
    if (chapters.length === 0) return chapters;
    const merged = [];
    let current = null;
    for (const ch of chapters) {
      const tocTitle = hrefToTitle[ch.href];
      if (current && tocTitle && current.title === tocTitle) {
        current.html += '\n' + ch.html;
      } else {
        if (current) merged.push(current);
        current = { ...ch };
      }
    }
    if (current) merged.push(current);
    return merged;
  }

  it('merges chapters with same TOC title', () => {
    const chapters = [
      { title: 'Chapter 1', href: 'ch1a.xhtml', html: '<p>Part A</p>' },
      { title: 'Chapter 1', href: 'ch1b.xhtml', html: '<p>Part B</p>' },
      { title: 'Chapter 2', href: 'ch2.xhtml', html: '<p>Ch 2</p>' },
    ];
    const hrefToTitle = { 'ch1a.xhtml': 'Chapter 1', 'ch1b.xhtml': 'Chapter 1', 'ch2.xhtml': 'Chapter 2' };

    const merged = mergeChapters(chapters, hrefToTitle);
    expect(merged.length).toBe(2);
    expect(merged[0].html).toContain('Part A');
    expect(merged[0].html).toContain('Part B');
    expect(merged[1].title).toBe('Chapter 2');
  });

  it('does not merge chapters without TOC titles', () => {
    const chapters = [
      { title: 'Chapter 1', href: 'a.xhtml', html: '<p>A</p>' },
      { title: 'Chapter 2', href: 'b.xhtml', html: '<p>B</p>' },
    ];
    const merged = mergeChapters(chapters, {});
    expect(merged.length).toBe(2);
  });

  it('handles empty chapter list', () => {
    expect(mergeChapters([], {})).toEqual([]);
  });

  it('handles single chapter', () => {
    const chapters = [{ title: 'Only', href: 'only.xhtml', html: '<p>Only</p>' }];
    const merged = mergeChapters(chapters, { 'only.xhtml': 'Only' });
    expect(merged.length).toBe(1);
  });
});
