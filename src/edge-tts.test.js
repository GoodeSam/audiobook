import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  stripMarkdown,
  splitIntoParagraphs,
  buildChapterSegments,
  buildSentenceModeSegments,
  getBeepBlob,
  generateChapterAudio,
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

  it('keeps short English words in Chinese context as one segment', () => {
    const segments = buildChapterSegments({
      originalText: 'Hello 你好世界 goodbye',
      audioMode: 'original',
    });

    // Short English words next to Chinese get merged — Chinese TTS reads them naturally
    expect(segments.length).toBe(1);
    expect(segments[0].lang).toBe('zh');
    expect(segments[0].text).toContain('你好世界');
    expect(segments[0].text).toContain('Hello');
  });

  it('splits long English passages from Chinese into separate segments', () => {
    const segments = buildChapterSegments({
      originalText: 'This is a complete English paragraph with many words here.\n\n这是中文段落。',
      audioMode: 'original',
    });

    expect(segments.length).toBe(2);
    expect(segments[0].lang).toBe('en');
    expect(segments[1].lang).toBe('zh');
  });

  it('keeps pure single-language paragraph as one segment', () => {
    const segments = buildChapterSegments({
      originalText: 'This is a purely English paragraph.',
      audioMode: 'original',
    });

    expect(segments.length).toBe(1);
    expect(segments[0].lang).toBe('en');
  });
});

describe('en-zh-en paragraph mode with separator chime', () => {
  it('inserts a beep between paragraph repeat-groups but not before the first', () => {
    const segments = buildChapterSegments({
      originalText: 'First paragraph.\n\nSecond paragraph.',
      translatedText: '第一段。\n\n第二段。',
      audioMode: 'en-zh-en',
    });
    const langs = segments.map(s => s.lang);
    expect(langs).toEqual(['en', 'zh', 'en', 'beep', 'en', 'zh', 'en']);
  });

  it('single paragraph gets no beep', () => {
    const segments = buildChapterSegments({
      originalText: 'Only one.',
      translatedText: '只有一段。',
      audioMode: 'en-zh-en',
    });
    expect(segments.some(s => s.lang === 'beep')).toBe(false);
  });
});

describe('buildSentenceModeSegments', () => {
  it('repeats each sentence EN→ZH→EN with beeps between sentence groups', async () => {
    const translateTexts = vi.fn(async (texts) => texts.map(t => `中(${t})`));
    const segments = await buildSentenceModeSegments({
      originalText: 'Hello world. How are you?',
      translateTexts,
    });
    expect(translateTexts).toHaveBeenCalledWith(['Hello world.', 'How are you?']);
    expect(segments.map(s => s.lang)).toEqual(
      ['en', 'zh', 'en', 'beep', 'en', 'zh', 'en']
    );
    expect(segments[0].text).toBe('Hello world.');
    expect(segments[1].text).toBe('中(Hello world.)');
    expect(segments[2].text).toBe('Hello world.');
    expect(segments[4].text).toBe('How are you?');
  });

  it('keeps paragraph indexes for player highlighting', async () => {
    const segments = await buildSentenceModeSegments({
      originalText: 'Para one.\n\nPara two.',
      translateTexts: async (texts) => texts.map(() => '译'),
    });
    expect(segments.filter(s => s.paraIndex === 0).length).toBeGreaterThan(0);
    expect(segments.filter(s => s.paraIndex === 1).length).toBeGreaterThan(0);
  });

  it('speaks already-Chinese sentences once without translation', async () => {
    const translateTexts = vi.fn(async (texts) => texts.map(() => '译'));
    const segments = await buildSentenceModeSegments({
      originalText: '这是中文句子。',
      translateTexts,
    });
    expect(translateTexts).not.toHaveBeenCalled();
    expect(segments.map(s => s.lang)).toEqual(['zh']);
  });

  it('strips markdown before splitting sentences', async () => {
    const segments = await buildSentenceModeSegments({
      originalText: '# Title\n\n**Bold** sentence.',
      translateTexts: async (texts) => texts.map(() => '译'),
    });
    expect(segments.every(s => !s.text.includes('*') && !s.text.includes('#'))).toBe(true);
  });
});

describe('getBeepBlob', () => {
  it('decodes a small CBR mp3 blob and caches it', () => {
    const a = getBeepBlob();
    const b = getBeepBlob();
    expect(a).toBe(b);
    expect(a.type).toBe('audio/mpeg');
    expect(a.size).toBeGreaterThan(2000);
    expect(a.size).toBeLessThan(10000);
  });
});

// ── generateChapterAudio: checkpoint integrity ──
//
// Root cause guard. `audioBlobs.length = 0` at the end of generateChapterAudio
// mutated the SAME array handed to the last onCheckpoint call by reference.
// On the happy path main.js deletes the checkpoint right after, so it was
// invisible — but if anything threw between the return and that delete, the
// surviving checkpoint claimed completedIndex=N while holding zero blobs, and
// resuming silently dropped the first N segments of the chapter.

describe('generateChapterAudio checkpoints', () => {
  /** Deterministic stand-in for the Edge TTS WebSocket call. */
  // `failAt` counts SEGMENTS, not calls — once that segment is reached it
  // fails on every attempt, so the built-in retry loop cannot mask it.
  function fakeSynth({ failAt = null } = {}) {
    let done = 0;
    return vi.fn(async (text) => {
      if (failAt !== null && done >= failAt) throw new Error('Edge TTS request timed out');
      done++;
      return new Blob([`audio:${text}`], { type: 'audio/mpeg' });
    });
  }

  const THREE_PARAS = 'First para.\n\nSecond para.\n\nThird para.';

  it('hands each checkpoint an independent snapshot of the blobs', async () => {
    const checkpoints = [];
    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: fakeSynth(),
      onCheckpoint: (cp) => checkpoints.push(cp),
    });

    expect(checkpoints.length).toBe(3);
    // Each checkpoint must still hold exactly the blobs it had at the time.
    expect(checkpoints[0].audioBlobs.length).toBe(1);
    expect(checkpoints[1].audioBlobs.length).toBe(2);
    expect(checkpoints[2].audioBlobs.length).toBe(3);
  });

  it('does not empty the last checkpoint when the chapter completes', async () => {
    let last = null;
    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: fakeSynth(),
      onCheckpoint: (cp) => { last = cp; },
    });

    expect(last.completedIndex).toBe(3);
    expect(last.audioBlobs.length).toBe(3); // was 0 before the fix
  });

  it('keeps a usable checkpoint when synthesis fails partway', async () => {
    let last = null;
    await expect(generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: fakeSynth({ failAt: 2 }),
      onCheckpoint: (cp) => { last = cp; },
    })).rejects.toThrow();

    expect(last.completedIndex).toBe(2);
    expect(last.audioBlobs.length).toBe(2);
  });

  it('resumes from a checkpoint without re-synthesizing earlier segments', async () => {
    const synth = fakeSynth();
    const priorBlobs = [new Blob(['a']), new Blob(['b'])];

    const { blob } = await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: synth,
      startIndex: 2,
      existingBlobs: priorBlobs,
    });

    expect(synth).toHaveBeenCalledTimes(1); // only the 3rd segment
    expect(blob.size).toBeGreaterThan(0);
  });

  it('records the audio mode on the checkpoint so a resume cannot cross modes', async () => {
    let last = null;
    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: fakeSynth(),
      onCheckpoint: (cp) => { last = cp; },
    });

    expect(last.audioMode).toBe('original');
  });
});

// ── Validated resume ──
//
// Only generateChapterAudio knows the chapter's real segment count, so it is
// the only place a stored checkpoint can be proven compatible. Handing it
// `checkpoint` instead of raw startIndex/existingBlobs makes a stale or
// cross-mode checkpoint degrade to a clean run rather than splice two
// different segment lists into one MP3.

describe('generateChapterAudio validated resume', () => {
  function fakeSynth() {
    return vi.fn(async (text) => new Blob([`audio:${text}`], { type: 'audio/mpeg' }));
  }

  const THREE_PARAS = 'First para.\n\nSecond para.\n\nThird para.';
  const goodCp = (n, total, mode = 'original') => ({
    completedIndex: n,
    totalSegments: total,
    audioMode: mode,
    audioBlobs: Array.from({ length: n }, (_, i) => new Blob([`old${i}`])),
  });

  it('resumes from a matching checkpoint', async () => {
    const synth = fakeSynth();
    let decision = null;

    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: synth,
      checkpoint: goodCp(2, 3),
      onResume: (d) => { decision = d; },
    });

    expect(synth).toHaveBeenCalledTimes(1);
    expect(decision).toEqual({ resuming: true, startIndex: 2, totalSegments: 3 });
  });

  it('ignores a checkpoint recorded for a different audio mode', async () => {
    const synth = fakeSynth();
    let decision = null;

    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: synth,
      checkpoint: goodCp(2, 3, 'bilingual'),
      onResume: (d) => { decision = d; },
    });

    expect(synth).toHaveBeenCalledTimes(3); // full regeneration
    expect(decision.resuming).toBe(false);
  });

  it('ignores a checkpoint whose segment count no longer matches the chapter', async () => {
    const synth = fakeSynth();

    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: synth,
      checkpoint: goodCp(2, 99),
    });

    expect(synth).toHaveBeenCalledTimes(3);
  });

  it('ignores a checkpoint that claims progress but holds no blobs', async () => {
    const synth = fakeSynth();

    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: synth,
      checkpoint: { completedIndex: 2, totalSegments: 3, audioMode: 'original', audioBlobs: [] },
    });

    expect(synth).toHaveBeenCalledTimes(3);
  });

  it('reports a clean start when there is no checkpoint at all', async () => {
    let decision = null;
    await generateChapterAudio({
      originalText: THREE_PARAS,
      audioMode: 'original',
      synthesize: fakeSynth(),
      onResume: (d) => { decision = d; },
    });

    expect(decision).toEqual({ resuming: false, startIndex: 0, totalSegments: 3 });
  });
});

describe('generateChapterAudio checkpoint backpressure', () => {
  it('waits for an async onCheckpoint before synthesizing the next segment', async () => {
    // Without this, IndexedDB writes fire-and-forget: two can be in flight at
    // once and a slow earlier write can land after a later one, leaving a
    // stale record on disk. Awaiting also bounds the write queue.
    const order = [];
    let releaseWrite;
    const gate = new Promise((r) => { releaseWrite = r; });
    let firstCheckpoint = true;

    const promise = generateChapterAudio({
      originalText: 'First para.\n\nSecond para.',
      audioMode: 'original',
      synthesize: async (text) => {
        order.push(`synth:${text}`);
        return new Blob([text], { type: 'audio/mpeg' });
      },
      onCheckpoint: async () => {
        if (!firstCheckpoint) return;
        firstCheckpoint = false;
        order.push('write:start');
        await gate;
        order.push('write:end');
      },
    });

    // Let the first segment + its checkpoint start, then confirm the second
    // segment has NOT begun while the write is outstanding.
    await new Promise(r => setTimeout(r, 10));
    expect(order).toEqual(['synth:First para.', 'write:start']);

    releaseWrite();
    await promise;

    expect(order).toEqual([
      'synth:First para.', 'write:start', 'write:end', 'synth:Second para.',
    ]);
  });

  it('does not fail when onCheckpoint is synchronous', async () => {
    const seen = [];
    await generateChapterAudio({
      originalText: 'One.\n\nTwo.',
      audioMode: 'original',
      synthesize: async (t) => new Blob([t]),
      onCheckpoint: (cp) => { seen.push(cp.completedIndex); },
    });
    expect(seen).toEqual([1, 2]);
  });

  it('continues generating when a checkpoint write rejects', async () => {
    const { blob } = await generateChapterAudio({
      originalText: 'One.\n\nTwo.',
      audioMode: 'original',
      synthesize: async (t) => new Blob([t]),
      onCheckpoint: async () => { throw new Error('QuotaExceededError'); },
    });
    expect(blob.size).toBeGreaterThan(0);
  });
});
