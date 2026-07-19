/**
 * Audio timeline — maps generated MP3 audio time to text positions.
 *
 * Edge TTS outputs constant-bitrate MP3 (audio-24khz-48kbitrate-mono-mp3),
 * so each segment's duration can be derived from its byte length. The chapter
 * MP3 is a plain concatenation of per-segment blobs, which means cumulative
 * byte-derived durations line up with the merged file's playback clock.
 *
 * A timeline is an ordered array of entries:
 *   { start, end, lang, paraIndex, text, sentences? }
 * where `sentences` (English entries only) further subdivides the segment
 * into { start, end, text } spans, allocated proportionally by character
 * count. This drives sentence-level highlighting in the player.
 */

const EDGE_TTS_KBPS = 48;

/**
 * Estimate MP3 duration in seconds from byte length (CBR assumption).
 * @param {number} bytes
 * @param {number} [kbps=48]
 * @returns {number} seconds
 */
export function estimateMp3DurationSec(bytes, kbps = EDGE_TTS_KBPS) {
  if (!bytes || bytes <= 0) return 0;
  return (bytes * 8) / (kbps * 1000);
}

/**
 * Split text into sentences (shared with TTS paragraph synthesis).
 * @param {string} text
 * @returns {string[]}
 */
export function splitIntoSentences(text) {
  if (!text.trim()) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z""])|(?<=[.!?])$/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Allocate sentence time spans within a segment, proportional to
 * each sentence's character count.
 *
 * @param {string} text - Segment text.
 * @param {number} start - Segment start time (seconds).
 * @param {number} duration - Segment duration (seconds).
 * @returns {Array<{start: number, end: number, text: string}>}
 */
export function allocateSentenceSpans(text, start, duration) {
  const sentences = splitIntoSentences(text);
  if (sentences.length === 0) return [];
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
  const spans = [];
  let t = start;
  for (let i = 0; i < sentences.length; i++) {
    const frac = sentences[i].length / totalChars;
    const end = i === sentences.length - 1 ? start + duration : t + duration * frac;
    spans.push({ start: t, end, text: sentences[i] });
    t = end;
  }
  return spans;
}

/**
 * Build a playback timeline from TTS segments and their audio byte sizes.
 *
 * @param {Array<{text: string, lang: string, paraIndex?: number}>} segments
 * @param {number[]} byteSizes - Byte length of each segment's MP3 blob.
 * @returns {Array<{start,end,lang,paraIndex,text,sentences?}>|null}
 *   null when segments and sizes don't align (e.g. stale checkpoint).
 */
export function buildTimeline(segments, byteSizes) {
  if (!segments || !byteSizes || segments.length !== byteSizes.length) return null;
  const entries = [];
  let t = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dur = estimateMp3DurationSec(byteSizes[i]);
    const entry = {
      start: t,
      end: t + dur,
      lang: seg.lang,
      paraIndex: seg.paraIndex ?? null,
      text: seg.text,
    };
    if (seg.lang === 'en') {
      entry.sentences = allocateSentenceSpans(seg.text, t, dur);
    }
    // Sentence-repeat mode: which English sentence a ZH translation belongs to
    if (seg.srcSentence) entry.srcSentence = seg.srcSentence;
    entries.push(entry);
    t += dur;
  }
  return entries;
}

/**
 * Binary-search the timeline for the entry active at time `t`.
 * @param {Array<{start,end}>} timeline
 * @param {number} t - Seconds.
 * @returns {number} entry index, or -1 when out of range / empty.
 */
export function findTimelineIndex(timeline, t) {
  if (!timeline || timeline.length === 0 || t < 0) return -1;
  let lo = 0, hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < timeline[mid].start) hi = mid - 1;
    else if (t >= timeline[mid].end) lo = mid + 1;
    else return mid;
  }
  // Past the end: report the last entry while within a small epsilon
  const last = timeline.length - 1;
  if (t >= timeline[last].end && t < timeline[last].end + 0.5) return last;
  return -1;
}

/**
 * Find the sentence index active at time `t` within a timeline entry.
 * @param {{sentences?: Array<{start,end}>}} entry
 * @param {number} t
 * @returns {number} sentence index, or -1 when no sentence spans exist.
 */
export function findSentenceIndex(entry, t) {
  if (!entry || !entry.sentences || entry.sentences.length === 0) return -1;
  for (let i = 0; i < entry.sentences.length; i++) {
    if (t >= entry.sentences[i].start && t < entry.sentences[i].end) return i;
  }
  if (t >= entry.sentences[entry.sentences.length - 1].end) return entry.sentences.length - 1;
  return -1;
}

/**
 * Format seconds as m:ss or h:mm:ss for the player UI.
 * @param {number} sec
 * @returns {string}
 */
export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
