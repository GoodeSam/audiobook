import { describe, it, expect } from 'vitest';
import { buildPublishManifest, countAudioChapters, buildPublishZip } from './publish-export.js';

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

  it('lists every generated mode under audioFiles, with distinct filenames', () => {
    const book = {
      title: 'Book',
      chapters: [
        { title: 'Ch1', markdown: 'A' },
        { title: 'Ch2', markdown: 'B' },
      ],
    };
    const audioVariants = {
      0: {
        original: { blob: { size: 1000 }, timeline: [{ start: 0, end: 1 }] },
        bilingual: { blob: { size: 2000 }, timeline: null },
      },
    };
    const manifest = buildPublishManifest(book, 'book', audioVariants);
    // Timelines are NOT embedded in the manifest (that's the whole point —
    // dense books can have megabytes of timing data, which every listener
    // would otherwise download just to browse chapter titles). Only a
    // pointer to the sidecar file that carries it, fetched lazily later.
    expect(manifest.chapters[0].audioFiles.original).toEqual({
      file: '001-original.mp3', size: 1000, timelineFile: '001-original.timeline.json',
    });
    expect(manifest.chapters[0].audioFiles.bilingual).toEqual({
      file: '001-bilingual.mp3', size: 2000, timelineFile: null,
    });
    // Chapter with no generated audio gets an empty map, not null/undefined
    expect(manifest.chapters[1].audioFiles).toEqual({});
    expect(JSON.stringify(manifest)).not.toContain('"start"'); // no raw timeline data leaked into the manifest
  });

  it('defaults audioVariants to empty when omitted', () => {
    const book = { title: 'Book', chapters: [{ title: 'Ch1', markdown: 'A' }] };
    const manifest = buildPublishManifest(book, 'book');
    expect(manifest.chapters[0].audioFiles).toEqual({});
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

describe('buildPublishZip', () => {
  it('packs a timeline sidecar file alongside the mp3 when a timeline exists', async () => {
    const book = { title: 'Book', chapters: [{ title: 'Ch1', markdown: 'A' }] };
    const timeline = [{ start: 0, end: 1, text: 'A' }];
    const audioVariants = { 0: { original: { blob: new Blob(['fake-mp3']), timeline } } };
    const { blob, manifest } = await buildPublishZip(book, 'book', audioVariants);

    expect(manifest.chapters[0].audioFiles.original.timelineFile).toBe('001-original.timeline.json');

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files).sort()).toEqual([
      '001-original.mp3', '001-original.timeline.json', 'book.json',
    ]);
    const packedTimeline = JSON.parse(await zip.file('001-original.timeline.json').async('text'));
    expect(packedTimeline).toEqual(timeline);
  });

  it('omits the sidecar file when a mode has no timeline', async () => {
    const book = { title: 'Book', chapters: [{ title: 'Ch1', markdown: 'A' }] };
    const audioVariants = { 0: { translated: { blob: new Blob(['fake-mp3']), timeline: null } } };
    const { blob } = await buildPublishZip(book, 'book', audioVariants);

    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files).sort()).toEqual(['001-translated.mp3', 'book.json']);
  });
});

describe('countAudioChapters', () => {
  it('counts only chapters with at least one audio mode', () => {
    const manifest = {
      chapters: [
        { audioFiles: { original: { file: '001-original.mp3' } } },
        { audioFiles: {} },
        { audioFiles: { bilingual: { file: '003-bilingual.mp3' }, original: { file: '003-original.mp3' } } },
      ],
    };
    expect(countAudioChapters(manifest)).toBe(2);
  });

  it('returns 0 for a manifest with no audio', () => {
    const manifest = { chapters: [{ audioFiles: {} }, { audioFiles: {} }] };
    expect(countAudioChapters(manifest)).toBe(0);
  });
});
