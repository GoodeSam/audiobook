import { describe, it, expect, vi } from 'vitest';

// We test the exported parseDOCX indirectly by building mock DOCX files.
// DOCX = ZIP with word/document.xml. We use JSZip to create them.

import JSZip from 'jszip';

// Helper: create a minimal DOCX file (as a Blob) with given document.xml body content.
async function makeDocx(bodyXml, { numbering } = {}) {
  const zip = new JSZip();
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`;
  zip.file('word/document.xml', docXml);
  if (numbering) {
    zip.file('word/numbering.xml', numbering);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  // Simulate a File object
  blob.name = 'test.docx';
  return blob;
}

describe('docx-parser', () => {
  let parseDOCX;

  beforeAll(async () => {
    ({ parseDOCX } = await import('./docx-parser.js'));
  });

  it('parses a simple DOCX with plain paragraphs', async () => {
    const file = await makeDocx(`
      <w:p><w:r><w:t>Hello world</w:t></w:r></w:p>
      <w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>
    `);
    const result = await parseDOCX(file);
    expect(result.title).toBe('test');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].markdown).toContain('Hello world');
    expect(result.chapters[0].markdown).toContain('Second paragraph');
  });

  it('extracts book title from filename', async () => {
    const file = await makeDocx(`<w:p><w:r><w:t>Content</w:t></w:r></w:p>`);
    file.name = 'My Great Book.docx';
    const result = await parseDOCX(file);
    expect(result.title).toBe('My Great Book');
  });

  it('splits chapters on Heading1 paragraphs', async () => {
    const file = await makeDocx(`
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t>Chapter One</w:t></w:r>
      </w:p>
      <w:p><w:r><w:t>Content of chapter one</w:t></w:r></w:p>
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t>Chapter Two</w:t></w:r>
      </w:p>
      <w:p><w:r><w:t>Content of chapter two</w:t></w:r></w:p>
    `);
    const result = await parseDOCX(file);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('Chapter One');
    expect(result.chapters[0].markdown).toContain('Content of chapter one');
    expect(result.chapters[1].title).toBe('Chapter Two');
    expect(result.chapters[1].markdown).toContain('Content of chapter two');
  });

  it('handles bold and italic formatting', async () => {
    const file = await makeDocx(`
      <w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r>
        <w:r><w:t> and </w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>italic text</w:t></w:r>
      </w:p>
    `);
    const result = await parseDOCX(file);
    expect(result.chapters[0].markdown).toContain('**Bold text**');
    expect(result.chapters[0].markdown).toContain('*italic text*');
  });

  it('handles bold+italic combined', async () => {
    const file = await makeDocx(`
      <w:p>
        <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Bold and italic</w:t></w:r>
      </w:p>
    `);
    const result = await parseDOCX(file);
    expect(result.chapters[0].markdown).toContain('***Bold and italic***');
  });

  it('converts heading styles to markdown headings', async () => {
    const file = await makeDocx(`
      <w:p>
        <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
        <w:r><w:t>Subheading</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:pStyle w:val="Heading3"/></w:pPr>
        <w:r><w:t>Sub-sub</w:t></w:r>
      </w:p>
    `);
    const result = await parseDOCX(file);
    // With only h2 and h3, split level is 2
    expect(result.chapters[0].title).toBe('Subheading');
    expect(result.chapters[0].markdown).toContain('### Sub-sub');
  });

  it('creates preamble chapter for content before first heading', async () => {
    const file = await makeDocx(`
      <w:p><w:r><w:t>Preface content</w:t></w:r></w:p>
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t>Chapter One</w:t></w:r>
      </w:p>
      <w:p><w:r><w:t>Chapter content</w:t></w:r></w:p>
    `);
    const result = await parseDOCX(file);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('test');
    expect(result.chapters[0].markdown).toContain('Preface content');
    expect(result.chapters[1].title).toBe('Chapter One');
  });

  it('handles empty document', async () => {
    const file = await makeDocx('');
    const result = await parseDOCX(file);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].markdown).toBe('');
  });

  it('throws on missing document.xml', async () => {
    const zip = new JSZip();
    zip.file('word/other.xml', '<foo/>');
    const blob = await zip.generateAsync({ type: 'blob' });
    blob.name = 'bad.docx';
    await expect(parseDOCX(blob)).rejects.toThrow('Invalid DOCX');
  });

  it('parses tables into markdown', async () => {
    const file = await makeDocx(`
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Header 1</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Header 2</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `);
    const result = await parseDOCX(file);
    const md = result.chapters[0].markdown;
    expect(md).toContain('Header 1');
    expect(md).toContain('Cell A');
    expect(md).toContain('|');
  });

  it('detects heading via outlineLvl', async () => {
    const file = await makeDocx(`
      <w:p>
        <w:pPr><w:outlineLvl w:val="0"/></w:pPr>
        <w:r><w:t>Outline Heading</w:t></w:r>
      </w:p>
      <w:p><w:r><w:t>Body text</w:t></w:r></w:p>
    `);
    const result = await parseDOCX(file);
    expect(result.chapters[0].title).toBe('Outline Heading');
  });
});
