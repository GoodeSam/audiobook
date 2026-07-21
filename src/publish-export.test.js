import { describe, it, expect } from 'vitest';
import { buildPublishManifest, countAudioChapters } from './publish-export.js';

describe('buildPublishManifest', () => {
  it('builds a manifest with title, id, and chapters', () => {
    const book = {
      title: 'My Book',
      chapters: [{ title: 'Ch1', markdown: 'Hello world.', translatedMarkdown: '你好世界。' }],
    };
    const manifest = buildPublishManifest(book, 'my-book', {});
    expect(manifest.id).toBe('my-book');
    expect(manifest.title).toBe('My Book');
    expect(manifest.chapters).toHaveLength(1);
    expect(manifest.chapters[0].title).toBe('Ch1');
    expect(manifest.chapters[0].markdown).toBe('Hello world.');
    expect(manifest.chapters[0].translatedMarkdown).toBe('你好世界。');
  });

  it('marks audioFile/audioSize/audioMode only for chapters with audio', () => {
    const book = {
      title: 'Book',
      chapters: [
        { title: 'Ch1', markdown: 'A' },
        { title: 'Ch2', markdown: 'B' },
      ],
    };
    const audioBlobs = { 0: { size: 12345 } };
    const audioModes = { 0: 'original' };
    const manifest = buildPublishManifest(book, 'book', audioBlobs, {}, audioModes);
    expect(manifest.chapters[0].audioFile).toBe('001.mp3');
    expect(manifest.chapters[0].audioSize).toBe(12345);
    expect(manifest.chapters[0].audioMode).toBe('original');
    expect(manifest.chapters[1].audioFile).toBeNull();
    expect(manifest.chapters[1].audioSize).toBeNull();
  });

  it('strips embedded images from markdown and translatedMarkdown', () => {
    const bigImage = `data:image/jpeg;base64,${'A'.repeat(50000)}`;
    const book = {
      title: 'Illustrated',
      chapters: [{
        title: 'Ch1',
        markdown: `Some text.\n\n![illustration](${bigImage})\n\nMore text.`,
        translatedMarkdown: `一些文字。\n\n![illustration](${bigImage})\n\n更多文字。`,
      }],
    };
    const manifest = buildPublishManifest(book, 'illustrated', {});
    expect(manifest.chapters[0].markdown).toBe('Some text.\n\nMore text.');
    expect(manifest.chapters[0].translatedMarkdown).toBe('一些文字。\n\n更多文字。');
    expect(JSON.stringify(manifest)).not.toContain('base64');
  });

  it('leaves chapters with no images untouched', () => {
    const book = {
      title: 'Plain',
      chapters: [{ title: 'Ch1', markdown: 'Just plain text with no images.', translatedMarkdown: null }],
    };
    const manifest = buildPublishManifest(book, 'plain', {});
    expect(manifest.chapters[0].markdown).toBe('Just plain text with no images.');
    expect(manifest.chapters[0].translatedMarkdown).toBeNull();
  });

  it('handles a chapter that is only an image (collapses to empty string)', () => {
    const book = {
      title: 'Cover',
      chapters: [{ title: 'Cover', markdown: '![cover](data:image/jpeg;base64,AAAA)', translatedMarkdown: null }],
    };
    const manifest = buildPublishManifest(book, 'cover', {});
    expect(manifest.chapters[0].markdown).toBe('');
  });
});

describe('countAudioChapters', () => {
  it('counts only chapters with audioFile set', () => {
    const manifest = {
      chapters: [
        { audioFile: '001.mp3' },
        { audioFile: null },
        { audioFile: '003.mp3' },
      ],
    };
    expect(countAudioChapters(manifest)).toBe(2);
  });

  it('returns 0 for a manifest with no audio', () => {
    const manifest = { chapters: [{ audioFile: null }, { audioFile: null }] };
    expect(countAudioChapters(manifest)).toBe(0);
  });
});
