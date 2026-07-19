import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractDocText,
  cleanDocText,
  docTextToChapters,
  isHeadingLine,
  parseDOC,
} from './doc-parser.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'test-fixtures');

function loadFixture(name) {
  const b = readFileSync(join(fixtures, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe('extractDocText', () => {
  it('extracts English text from a real .doc file', () => {
    const text = extractDocText(loadFixture('sample-en.doc'));
    expect(text).toContain('The morning sun rose over the hills.');
    expect(text).toContain('Fresh bread and fruit filled every stall.');
  });

  it('extracts mixed Chinese/English text (UTF-16 pieces)', () => {
    const text = extractDocText(loadFixture('sample-zh.doc'));
    expect(text).toContain('这是一个双语测试文档');
    expect(text).toContain('This is a bilingual test.');
    expect(text).toContain('中文字符');
  });

  it('rejects non-doc data', () => {
    const junk = new TextEncoder().encode('this is not a doc file at all, just text').buffer;
    expect(() => extractDocText(junk)).toThrow(/OLE2|doc/i);
  });
});

describe('cleanDocText', () => {
  it('keeps paragraph marks and normalizes breaks', () => {
    expect(cleanDocText('one\rtwo\x0bthree')).toBe('one\rtwo\nthree');
  });

  it('strips field codes but keeps field results', () => {
    // 0x13 HYPERLINK instruction 0x14 visible text 0x15
    const raw = 'see \x13HYPERLINK "http://x"\x14example site\x15 here';
    expect(cleanDocText(raw)).toBe('see example site here');
  });

  it('replaces table cell marks and strips control chars', () => {
    expect(cleanDocText('a\x07b\x07\x01c')).toBe('a b c');
  });
});

describe('isHeadingLine', () => {
  it('detects English chapter headings', () => {
    expect(isHeadingLine('Chapter 1')).toBe(true);
    expect(isHeadingLine('CHAPTER XII')).toBe(true);
    expect(isHeadingLine('Part Two')).toBe(true);
    expect(isHeadingLine('Prologue')).toBe(true);
  });

  it('detects Chinese chapter headings', () => {
    expect(isHeadingLine('第一章')).toBe(true);
    expect(isHeadingLine('第12章 起风了')).toBe(true);
    expect(isHeadingLine('前言')).toBe(true);
  });

  it('rejects normal sentences', () => {
    expect(isHeadingLine('The chapter was long and boring to read.')).toBe(false);
    expect(isHeadingLine('He waited for part of the day.')).toBe(false);
    expect(isHeadingLine('')).toBe(false);
  });
});

describe('docTextToChapters', () => {
  it('splits on heading lines', () => {
    const text = 'Chapter 1\rFirst para.\rSecond para.\rChapter 2\rThird para.';
    const chapters = docTextToChapters(text, 'Book');
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe('Chapter 1');
    expect(chapters[0].markdown).toContain('First para.');
    expect(chapters[1].title).toBe('Chapter 2');
  });

  it('returns a single chapter when no headings', () => {
    const chapters = docTextToChapters('Just one para.\rAnd another.', 'My Book');
    expect(chapters.length).toBe(1);
    expect(chapters[0].title).toBe('My Book');
    expect(chapters[0].markdown).toBe('Just one para.\n\nAnd another.');
  });

  it('puts content before the first heading into a preamble chapter', () => {
    const chapters = docTextToChapters('Intro text.\rChapter 1\rBody.', 'Book');
    expect(chapters.length).toBe(2);
    expect(chapters[0].title).toBe('Book');
    expect(chapters[1].title).toBe('Chapter 1');
  });
});

describe('parseDOC', () => {
  it('parses a File into title and chapters', async () => {
    const buf = loadFixture('sample-en.doc');
    const file = new File([buf], 'My Sample Book.doc');
    const book = await parseDOC(file);
    expect(book.title).toBe('My Sample Book');
    expect(book.chapters.length).toBe(2);
    expect(book.chapters[0].title).toMatch(/Chapter 1/);
    expect(book.chapters[1].markdown).toContain('village market');
  });
});
