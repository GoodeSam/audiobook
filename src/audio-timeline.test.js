import { describe, it, expect } from 'vitest';
import {
  estimateMp3DurationSec,
  allocateSentenceSpans,
  buildTimeline,
  findTimelineIndex,
  findSentenceIndex,
  formatTime,
  splitIntoSentences,
} from './audio-timeline.js';

describe('estimateMp3DurationSec', () => {
  it('derives duration from bytes at 48kbps CBR', () => {
    // 48kbps = 6000 bytes/sec
    expect(estimateMp3DurationSec(6000)).toBeCloseTo(1);
    expect(estimateMp3DurationSec(60000)).toBeCloseTo(10);
  });

  it('returns 0 for empty or invalid sizes', () => {
    expect(estimateMp3DurationSec(0)).toBe(0);
    expect(estimateMp3DurationSec(undefined)).toBe(0);
  });
});

describe('splitIntoSentences', () => {
  it('splits on sentence-ending punctuation', () => {
    const result = splitIntoSentences('Hello world. How are you? Fine!');
    expect(result).toEqual(['Hello world.', 'How are you?', 'Fine!']);
  });

  it('returns empty array for blank text', () => {
    expect(splitIntoSentences('   ')).toEqual([]);
  });

  it('splits sentences of single-quoted dialogue (straight quotes)', () => {
    // Real text from a children's book — every boundary here previously
    // failed to split because a closing/opening quote sat between the
    // punctuation and the whitespace, defeating the lookbehind/lookahead.
    const text = "'Why don't you fly faster?' Hummingbird called to Heron. 'Then you can drink from the flowers too!' Hummingbird looked at Heron behind him, and laughed.";
    const result = splitIntoSentences(text);
    expect(result).toEqual([
      "'Why don't you fly faster?'",
      'Hummingbird called to Heron.',
      "'Then you can drink from the flowers too!'",
      'Hummingbird looked at Heron behind him, and laughed.',
    ]);
  });

  it('splits sentences of single-quoted dialogue (curly quotes)', () => {
    const text = '‘Are you tired, Heron?’ he laughed. ‘I had a very good sleep.’';
    expect(splitIntoSentences(text)).toEqual([
      '‘Are you tired, Heron?’ he laughed.',
      '‘I had a very good sleep.’',
    ]);
  });

  it('still splits plain sentences with a double-quoted opener', () => {
    const result = splitIntoSentences('He said hello. "Good morning," she replied.');
    expect(result).toEqual(['He said hello.', '"Good morning," she replied.']);
  });
});

describe('allocateSentenceSpans', () => {
  it('allocates spans proportionally by character count', () => {
    // Two sentences of equal length → equal halves
    const spans = allocateSentenceSpans('Aaaa bbb x. Cccc ddd y.', 10, 4);
    expect(spans.length).toBe(2);
    expect(spans[0].start).toBeCloseTo(10);
    expect(spans[0].end).toBeCloseTo(12);
    expect(spans[1].start).toBeCloseTo(12);
    expect(spans[1].end).toBeCloseTo(14);
  });

  it('last span always ends exactly at segment end', () => {
    const spans = allocateSentenceSpans('Short. A much much longer sentence here.', 0, 6);
    expect(spans[spans.length - 1].end).toBeCloseTo(6);
  });

  it('returns empty array for empty text', () => {
    expect(allocateSentenceSpans('', 0, 5)).toEqual([]);
  });
});

describe('buildTimeline', () => {
  const segments = [
    { text: 'Hello world. Goodbye now.', lang: 'en', paraIndex: 0 },
    { text: '你好世界。再见。', lang: 'zh', paraIndex: 0 },
    { text: 'Second paragraph here.', lang: 'en', paraIndex: 1 },
  ];

  it('builds cumulative start/end times from byte sizes', () => {
    const tl = buildTimeline(segments, [6000, 12000, 6000]);
    expect(tl.length).toBe(3);
    expect(tl[0].start).toBeCloseTo(0);
    expect(tl[0].end).toBeCloseTo(1);
    expect(tl[1].start).toBeCloseTo(1);
    expect(tl[1].end).toBeCloseTo(3);
    expect(tl[2].start).toBeCloseTo(3);
    expect(tl[2].end).toBeCloseTo(4);
  });

  it('preserves lang and paraIndex', () => {
    const tl = buildTimeline(segments, [6000, 12000, 6000]);
    expect(tl[1].lang).toBe('zh');
    expect(tl[1].paraIndex).toBe(0);
    expect(tl[2].paraIndex).toBe(1);
  });

  it('adds sentence spans only for English entries', () => {
    const tl = buildTimeline(segments, [6000, 12000, 6000]);
    expect(tl[0].sentences.length).toBe(2);
    expect(tl[1].sentences).toBeUndefined();
  });

  it('returns null when segments and sizes are misaligned', () => {
    expect(buildTimeline(segments, [6000])).toBeNull();
    expect(buildTimeline(null, [])).toBeNull();
  });
});

describe('findTimelineIndex', () => {
  const tl = [
    { start: 0, end: 2 },
    { start: 2, end: 5 },
    { start: 5, end: 9 },
  ];

  it('finds the active entry via binary search', () => {
    expect(findTimelineIndex(tl, 0)).toBe(0);
    expect(findTimelineIndex(tl, 1.99)).toBe(0);
    expect(findTimelineIndex(tl, 2)).toBe(1);
    expect(findTimelineIndex(tl, 8.5)).toBe(2);
  });

  it('tolerates slight overshoot past the end', () => {
    expect(findTimelineIndex(tl, 9.2)).toBe(2);
  });

  it('returns -1 for far out-of-range times and empty timelines', () => {
    expect(findTimelineIndex(tl, 30)).toBe(-1);
    expect(findTimelineIndex(tl, -1)).toBe(-1);
    expect(findTimelineIndex([], 0)).toBe(-1);
    expect(findTimelineIndex(null, 0)).toBe(-1);
  });
});

describe('findSentenceIndex', () => {
  const entry = {
    sentences: [
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ],
  };

  it('finds the active sentence', () => {
    expect(findSentenceIndex(entry, 0.5)).toBe(0);
    expect(findSentenceIndex(entry, 3)).toBe(1);
  });

  it('clamps to the last sentence at segment end', () => {
    expect(findSentenceIndex(entry, 4.1)).toBe(1);
  });

  it('returns -1 when no sentence spans', () => {
    expect(findSentenceIndex({}, 1)).toBe(-1);
    expect(findSentenceIndex(null, 1)).toBe(-1);
  });
});

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(600)).toBe('10:00');
  });

  it('formats hours', () => {
    expect(formatTime(3661)).toBe('1:01:01');
  });

  it('handles invalid input', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});
