import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  stripMarkdown,
  splitIntoParagraphs,
  buildChapterSegments,
} from './edge-tts.js';

describe('stripMarkdown', () => {
  it('strips headings', () => {
    expect(stripMarkdown('# Title')).toBe('Title');
    expect(stripMarkdown('## Subtitle')).toBe('Subtitle');
    expect(stripMarkdown('### H3 heading')).toBe('H3 heading');
  });

  it('strips bold markers', () => {
    expect(stripMarkdown('**bold text**')).toBe('bold text');
  });

  it('strips italic markers', () => {
    expect(stripMarkdown('*italic text*')).toBe('italic text');
  });

  it('strips inline code', () => {
    expect(stripMarkdown('use `code` here')).toBe('use code here');
  });

  it('strips links, keeping text', () => {
    expect(stripMarkdown('[click here](http://example.com)')).toBe('click here');
  });

  it('removes image markdown', () => {
    expect(stripMarkdown('![alt text](image.png)')).toBe('');
  });

  it('strips list markers', () => {
    expect(stripMarkdown('- item one')).toBe('item one');
    expect(stripMarkdown('* item two')).toBe('item two');
    expect(stripMarkdown('1. numbered item')).toBe('numbered item');
  });

  it('strips blockquote markers', () => {
    expect(stripMarkdown('> quoted text')).toBe('quoted text');
  });

  it('removes horizontal rules', () => {
    expect(stripMarkdown('---')).toBe('');
    expect(stripMarkdown('-----')).toBe('');
  });

  it('handles combined formatting', () => {
    const input = '## **Chapter 1**: *Introduction*';
    const result = stripMarkdown(input);
    expect(result).toBe('Chapter 1: Introduction');
  });
});

describe('splitIntoParagraphs', () => {
  it('splits on double newlines', () => {
    const result = splitIntoParagraphs('First paragraph.\n\nSecond paragraph.');
    expect(result).toEqual(['First paragraph.', 'Second paragraph.']);
  });

  it('filters out empty paragraphs', () => {
    const result = splitIntoParagraphs('Text.\n\n\n\nMore text.');
    expect(result).toEqual(['Text.', 'More text.']);
  });

  it('filters out bare heading markers', () => {
    const result = splitIntoParagraphs('# \n\nReal content.');
    expect(result).toEqual(['Real content.']);
  });

  it('collapses single newlines within paragraphs', () => {
    const result = splitIntoParagraphs('Line one\nLine two');
    expect(result).toEqual(['Line one Line two']);
  });

  it('returns empty array for empty input', () => {
    expect(splitIntoParagraphs('')).toEqual([]);
  });
});

describe('buildChapterSegments', () => {
  it('builds original-only segments', () => {
    const segments = buildChapterSegments({
      originalText: 'Hello world.\n\nGoodbye world.',
      audioMode: 'original',
    });

    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe('Hello world.');
    expect(segments[0].lang).toBe('en');
    expect(segments[1].text).toBe('Goodbye world.');
  });

  it('builds translated-only segments', () => {
    const segments = buildChapterSegments({
      originalText: 'Hello.\n\nWorld.',
      translatedText: '你好。\n\n世界。',
      audioMode: 'translated',
    });

    expect(segments.length).toBe(2);
    expect(segments[0].text).toBe('你好。');
    expect(segments[0].lang).toBe('zh');
    expect(segments[1].text).toBe('世界。');
  });

  it('builds bilingual segments (original then translated per paragraph)', () => {
    const segments = buildChapterSegments({
      originalText: 'Hello world.\n\nGoodbye.',
      translatedText: '你好世界。\n\n再见。',
      audioMode: 'bilingual',
    });

    // Should interleave: en, zh, en, zh
    expect(segments.length).toBe(4);
    expect(segments[0].text).toBe('Hello world.');
    expect(segments[0].lang).toBe('en');
    expect(segments[1].text).toBe('你好世界。');
    expect(segments[1].lang).toBe('zh');
    expect(segments[2].text).toBe('Goodbye.');
    expect(segments[2].lang).toBe('en');
    expect(segments[3].text).toBe('再见。');
    expect(segments[3].lang).toBe('zh');
  });

  it('detects Chinese text in original mode', () => {
    const segments = buildChapterSegments({
      originalText: '这是中文段落。\n\nThis is English.',
      audioMode: 'original',
    });

    expect(segments[0].lang).toBe('zh');
    expect(segments[1].lang).toBe('en');
  });

  it('handles mismatched paragraph counts in bilingual mode', () => {
    const segments = buildChapterSegments({
      originalText: 'Para 1.\n\nPara 2.\n\nPara 3.',
      translatedText: '段落一。\n\n段落二。',
      audioMode: 'bilingual',
    });

    // Should produce pairs for available translations, then remaining originals
    expect(segments.length).toBe(5); // 2 pairs + 1 unpaired original
  });

  it('strips markdown before building segments', () => {
    const segments = buildChapterSegments({
      originalText: '## Chapter Title\n\n**Bold text** here.',
      audioMode: 'original',
    });

    expect(segments[0].text).toBe('Chapter Title');
    expect(segments[1].text).toBe('Bold text here.');
  });

  it('returns empty array for empty text', () => {
    const segments = buildChapterSegments({
      originalText: '',
      audioMode: 'original',
    });
    expect(segments).toEqual([]);
  });

  it('filters out image-only paragraphs', () => {
    const segments = buildChapterSegments({
      originalText: '![image](pic.png)\n\nReal text.',
      audioMode: 'original',
    });

    expect(segments.length).toBe(1);
    expect(segments[0].text).toBe('Real text.');
  });
});
