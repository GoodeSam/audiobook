import { describe, it, expect } from 'vitest';
import { parseHTML } from './html-parser.js';

function makeFile(content, name = 'test.html') {
  const blob = new Blob([content], { type: 'text/html' });
  return new File([blob], name, { type: 'text/html' });
}

describe('parseHTML', () => {
  it('extracts title from <title> tag', async () => {
    const file = makeFile('<html><head><title>My Book</title></head><body><p>Content</p></body></html>');
    const result = await parseHTML(file);
    expect(result.title).toBe('My Book');
  });

  it('falls back to first <h1> when no <title>', async () => {
    const file = makeFile('<body><h1>Chapter Title</h1><p>Content</p></body>');
    const result = await parseHTML(file);
    expect(result.title).toBe('Chapter Title');
  });

  it('falls back to filename when no title or h1', async () => {
    const file = makeFile('<body><p>Just text</p></body>', 'my-article.html');
    const result = await parseHTML(file);
    expect(result.title).toBe('my-article');
  });

  it('returns single chapter when no headings', async () => {
    const file = makeFile('<body><p>Para one.</p><p>Para two.</p></body>');
    const result = await parseHTML(file);
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].markdown).toContain('Para one.');
    expect(result.chapters[0].markdown).toContain('Para two.');
  });

  it('splits chapters at top-level heading (h1)', async () => {
    const html = `<body>
      <h1>Chapter One</h1>
      <p>Content of chapter one.</p>
      <h1>Chapter Two</h1>
      <p>Content of chapter two.</p>
    </body>`;
    const file = makeFile(html);
    const result = await parseHTML(file);
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0].title).toBe('Chapter One');
    expect(result.chapters[0].markdown).toContain('Content of chapter one.');
    expect(result.chapters[1].title).toBe('Chapter Two');
    expect(result.chapters[1].markdown).toContain('Content of chapter two.');
  });

  it('splits chapters at h2 when h2 is the top-level heading', async () => {
    const html = `<body>
      <p>Intro text</p>
      <h2>Section One</h2>
      <p>Section one content.</p>
      <h2>Section Two</h2>
      <p>Section two content.</p>
    </body>`;
    const file = makeFile(html);
    const result = await parseHTML(file);
    expect(result.chapters).toHaveLength(3); // intro + 2 sections
    expect(result.chapters[1].title).toBe('Section One');
    expect(result.chapters[2].title).toBe('Section Two');
  });

  it('converts HTML content to markdown', async () => {
    const html = `<body>
      <h1>Chapter</h1>
      <p><strong>Bold text</strong> and <em>italic</em>.</p>
      <ul><li>Item one</li><li>Item two</li></ul>
    </body>`;
    const file = makeFile(html);
    const result = await parseHTML(file);
    expect(result.chapters[0].markdown).toContain('**Bold text**');
    expect(result.chapters[0].markdown).toContain('*italic*');
    expect(result.chapters[0].markdown).toContain('- Item one');
  });

  it('handles empty body gracefully', async () => {
    const file = makeFile('<html><head><title>Empty</title></head><body></body></html>');
    const result = await parseHTML(file);
    expect(result.title).toBe('Empty');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].markdown).toBe('');
  });

  it('strips script and style tags from output', async () => {
    const html = `<body>
      <script>alert("xss")</script>
      <style>.x { color: red }</style>
      <p>Clean content</p>
    </body>`;
    const file = makeFile(html);
    const result = await parseHTML(file);
    expect(result.chapters[0].markdown).toContain('Clean content');
    expect(result.chapters[0].markdown).not.toContain('alert');
    expect(result.chapters[0].markdown).not.toContain('.x');
  });
});
