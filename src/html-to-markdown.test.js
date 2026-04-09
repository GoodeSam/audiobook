import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, cleanMarkdown } from './html-to-markdown.js';

describe('htmlToMarkdown', () => {
  it('converts headings', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toContain('# Title');
    expect(htmlToMarkdown('<h2>Subtitle</h2>')).toContain('## Subtitle');
    expect(htmlToMarkdown('<h3>H3</h3>')).toContain('### H3');
  });

  it('converts paragraphs', () => {
    const result = htmlToMarkdown('<p>First paragraph.</p><p>Second paragraph.</p>');
    expect(result).toContain('First paragraph.');
    expect(result).toContain('Second paragraph.');
  });

  it('converts bold and italic', () => {
    expect(htmlToMarkdown('<p><strong>bold</strong></p>')).toContain('**bold**');
    expect(htmlToMarkdown('<p><em>italic</em></p>')).toContain('*italic*');
    expect(htmlToMarkdown('<p><b>bold</b></p>')).toContain('**bold**');
    expect(htmlToMarkdown('<p><i>italic</i></p>')).toContain('*italic*');
  });

  it('converts links', () => {
    const result = htmlToMarkdown('<p><a href="https://example.com">Click</a></p>');
    expect(result).toContain('[Click](https://example.com)');
  });

  it('strips anchor links (fragment only)', () => {
    const result = htmlToMarkdown('<p><a href="#note1">Note 1</a></p>');
    expect(result).toContain('Note 1');
    expect(result).not.toContain('[Note 1]');
  });

  it('converts images', () => {
    const result = htmlToMarkdown('<img src="pic.jpg" alt="Photo">');
    expect(result).toContain('![Photo](pic.jpg)');
  });

  it('converts unordered lists', () => {
    const result = htmlToMarkdown('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(result).toContain('- Item 1');
    expect(result).toContain('- Item 2');
  });

  it('converts ordered lists', () => {
    const result = htmlToMarkdown('<ol><li>First</li><li>Second</li></ol>');
    expect(result).toContain('1. First');
    expect(result).toContain('2. Second');
  });

  it('converts blockquotes', () => {
    const result = htmlToMarkdown('<blockquote>Quoted text</blockquote>');
    expect(result).toContain('> Quoted text');
  });

  it('converts code blocks', () => {
    const result = htmlToMarkdown('<pre><code>console.log("hi")</code></pre>');
    expect(result).toContain('```');
    expect(result).toContain('console.log("hi")');
  });

  it('converts inline code', () => {
    const result = htmlToMarkdown('<p>Use <code>npm install</code> to install.</p>');
    expect(result).toContain('`npm install`');
  });

  it('converts horizontal rules', () => {
    const result = htmlToMarkdown('<hr>');
    expect(result).toContain('---');
  });

  it('converts tables', () => {
    const html = '<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>';
    const result = htmlToMarkdown(html);
    expect(result).toContain('Name');
    expect(result).toContain('Alice');
    expect(result).toContain('|');
  });

  it('strips script and style tags', () => {
    const result = htmlToMarkdown('<p>Text</p><script>alert("xss")</script><style>.x{}</style>');
    expect(result).toContain('Text');
    expect(result).not.toContain('alert');
    expect(result).not.toContain('.x{}');
  });

  it('handles nested elements', () => {
    const result = htmlToMarkdown('<p><strong><em>bold italic</em></strong></p>');
    expect(result).toContain('bold italic');
  });

  it('handles empty input', () => {
    expect(htmlToMarkdown('')).toBe('');
  });

  it('preserves br as newline', () => {
    const result = htmlToMarkdown('<p>Line one<br>Line two</p>');
    expect(result).toContain('Line one');
    expect(result).toContain('Line two');
  });
});

describe('cleanMarkdown', () => {
  it('collapses multiple blank lines', () => {
    const result = cleanMarkdown('A\n\n\n\n\nB');
    expect(result).toBe('A\n\nB');
  });

  it('trims leading whitespace', () => {
    const result = cleanMarkdown('\n\n  Text');
    expect(result).toBe('Text');
  });

  it('replaces trailing whitespace with a single newline', () => {
    const result = cleanMarkdown('Text\n\n\n');
    expect(result).toBe('Text\n');
  });
});
