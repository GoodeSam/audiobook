/**
 * Edge TTS - Microsoft Edge Read Aloud WebSocket TTS engine.
 *
 * Ported from EasyOriginals' book-audio.js. Provides free text-to-speech
 * synthesis via the Edge browser's built-in TTS service.
 *
 * Supports dual voice/speed for Chinese and English, with three audio modes:
 * - original: speak the original text
 * - translated: speak the translated text
 * - bilingual: interleave original and translated per paragraph
 */

import { detectLanguage, splitByLanguage } from './language-utils.js';
import { convertNumbersToChinese } from './number-to-chinese.js';

const EDGE_TTS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const EDGE_TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const SEC_MS_GEC_VERSION = '1-130.0.2849.68';

const SYNTH_TIMEOUT_BASE_MS = 30000;
const SYNTH_TIMEOUT_PER_CHAR_MS = 15;
const SYNTH_MAX_RETRIES = 2;

let _cancelled = false;
let _activeWebSocket = null;

function langFromVoice(voice) {
  const m = voice.match(/^([a-z]{2}-[A-Z]{2})/);
  return m ? m[1] : 'en-US';
}

// GEC token is valid for 5-minute buckets — cache to avoid re-hashing per segment
let _gecCache = null;
let _gecBucket = 0;

async function generateSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000);
  ticks += 11644473600;
  ticks -= ticks % 300;

  // Return cached token if still in the same 5-minute bucket
  if (_gecCache && ticks === _gecBucket) return _gecCache;
  _gecBucket = ticks;

  ticks *= 1e7;
  const input = `${ticks}${EDGE_TTS_TOKEN}`;
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  _gecCache = Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return _gecCache;
}

/**
 * Synthesize text into an MP3 audio Blob using Edge TTS.
 *
 * @param {string} text - Text to synthesize.
 * @param {object} options - { voice, speechRate }
 * @returns {Promise<Blob>} MP3 audio blob.
 */
export async function synthesizeText(text, options = {}) {
  const voice = options.voice || 'en-US-ChristopherNeural';
  const speechRate = options.speechRate || 0;

  // Convert Arabic numerals to Chinese characters for Chinese voices
  // so TTS reads numbers in Chinese instead of English pronunciation
  const lang = langFromVoice(voice);
  if (lang.startsWith('zh')) {
    text = convertNumbersToChinese(text);
  }
  const connId = crypto.randomUUID().replace(/-/g, '');
  const requestId = crypto.randomUUID().replace(/-/g, '');
  const gecToken = await generateSecMsGec();

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${EDGE_TTS_URL}?TrustedClientToken=${EDGE_TTS_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${gecToken}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
    );
    _activeWebSocket = ws;
    ws.binaryType = 'arraybuffer';
    const audioChunks = [];
    const timeoutMs = SYNTH_TIMEOUT_BASE_MS + text.length * SYNTH_TIMEOUT_PER_CHAR_MS;
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Edge TTS request timed out'));
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(
        'Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
              }
            }
          }
        })
      );

      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const rateVal = Number(speechRate) || 0;
      const rateStr = (rateVal >= 0 ? '+' : '') + rateVal + '%';
      const lang = langFromVoice(voice);
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rateStr}' volume='+0%'>${escaped}</prosody></voice></speak>`;
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);
    };

    let settled = false;
    const originalResolve = resolve;
    const originalReject = reject;
    resolve = (v) => { if (!settled) { settled = true; originalResolve(v); } };
    reject = (e) => { if (!settled) { settled = true; originalReject(e); } };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          clearTimeout(timeout);
          _activeWebSocket = null;
          ws.close();
          if (audioChunks.length === 0) {
            const voiceLang = langFromVoice(voice);
            reject(new Error(
              `Edge TTS returned no audio for voice "${voice}" (${voiceLang}). ` +
              'The voice language may not match the text. ' +
              'Check Settings and select a voice that matches your content language.'
            ));
            return;
          }
          resolve(new Blob(audioChunks, { type: 'audio/mpeg' }));
        }
      } else if (event.data instanceof ArrayBuffer) {
        const buf = event.data;
        const view = new DataView(buf);
        const headerLen = view.getUint16(0);
        if (buf.byteLength > headerLen + 2) {
          audioChunks.push(new Uint8Array(buf, headerLen + 2));
        }
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      _activeWebSocket = null;
      reject(new Error('Edge TTS connection failed'));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      _activeWebSocket = null;
      if (!settled) {
        reject(new Error(_cancelled ? 'Audio generation cancelled' : 'Edge TTS connection closed unexpectedly'));
      }
    };
  });
}

/**
 * Strip markdown formatting from text for cleaner TTS output.
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')          // Headings
    .replace(/\*\*(.+?)\*\*/g, '$1')       // Bold
    .replace(/\*(.+?)\*/g, '$1')           // Italic
    .replace(/`(.+?)`/g, '$1')             // Inline code
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Images (before links!)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/^[-*+]\s+/gm, '')            // Unordered lists
    .replace(/^\d+\.\s+/gm, '')            // Ordered lists
    .replace(/^>\s+/gm, '')                // Blockquotes
    .replace(/---+/g, '')                  // Horizontal rules
    .replace(/\|/g, '')                    // Table pipes
    .trim();
}

/**
 * Split markdown text into paragraphs for TTS processing.
 * @param {string} text
 * @returns {string[]}
 */
export function splitIntoParagraphs(text) {
  if (!text.trim()) return [];
  return text
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0 && !/^#{1,6}\s*$/.test(p));
}

/**
 * Split a paragraph into language segments for dual-voice routing.
 * If the paragraph contains mixed Chinese/English, it will be split into
 * separate segments. Pure single-language paragraphs remain as one segment.
 */
function splitParaIntoSegments(text, segments) {
  const langSegments = splitByLanguage(text);
  for (const seg of langSegments) {
    const trimmed = seg.text.trim();
    if (trimmed) {
      segments.push({ text: trimmed, lang: seg.lang });
    }
  }
}

/**
 * Build an ordered list of TTS segments from chapter text.
 * Each segment has { text, lang } for voice/speed routing.
 *
 * @param {object} options
 * @param {string} options.originalText - Original chapter markdown.
 * @param {string} [options.translatedText] - Translated chapter markdown.
 * @param {'original'|'translated'|'bilingual'} options.audioMode
 * @returns {Array<{text: string, lang: 'zh'|'en'}>}
 */
export function buildChapterSegments({ originalText, translatedText, audioMode }) {
  const origParas = splitIntoParagraphs(originalText || '');
  const transParas = translatedText ? splitIntoParagraphs(translatedText) : [];

  const segments = [];

  if (audioMode === 'translated') {
    for (const para of transParas) {
      const clean = stripMarkdown(para);
      if (!clean.trim()) continue;
      splitParaIntoSegments(clean, segments);
    }
  } else if (audioMode === 'bilingual') {
    const maxLen = Math.max(origParas.length, transParas.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < origParas.length) {
        const cleanOrig = stripMarkdown(origParas[i]);
        if (cleanOrig.trim()) splitParaIntoSegments(cleanOrig, segments);
      }
      if (i < transParas.length) {
        const cleanTrans = stripMarkdown(transParas[i]);
        if (cleanTrans.trim()) splitParaIntoSegments(cleanTrans, segments);
      }
    }
  } else {
    // 'original' mode (default)
    for (const para of origParas) {
      const clean = stripMarkdown(para);
      if (!clean.trim()) continue;
      splitParaIntoSegments(clean, segments);
    }
  }

  return segments;
}

/**
 * Generate audio for a full chapter using dual voice/speed settings.
 *
 * @param {object} options
 * @param {string} options.originalText - Original chapter markdown.
 * @param {string} [options.translatedText] - Translated chapter markdown.
 * @param {'original'|'translated'|'bilingual'} [options.audioMode='original']
 * @param {string} [options.voiceEn='en-US-ChristopherNeural'] - English voice.
 * @param {string} [options.voiceZh='zh-CN-YunyangNeural'] - Chinese voice.
 * @param {number} [options.speechRateEn=0] - English speech rate.
 * @param {number} [options.speechRateZh=0] - Chinese speech rate.
 * @param {Function} [options.onProgress] - Progress callback(current, total).
 * @returns {Promise<Blob>} Concatenated MP3 blob.
 */
/**
 * Generate audio for a full chapter using dual voice/speed settings.
 * Supports resumption via options.startIndex and options.existingBlobs.
 *
 * @param {object} options
 * @param {string} options.originalText - Original chapter markdown.
 * @param {string} [options.translatedText] - Translated chapter markdown.
 * @param {'original'|'translated'|'bilingual'} [options.audioMode='original']
 * @param {string} [options.voiceEn] - English voice.
 * @param {string} [options.voiceZh] - Chinese voice.
 * @param {number} [options.speechRateEn=0] - English speech rate.
 * @param {number} [options.speechRateZh=0] - Chinese speech rate.
 * @param {Function} [options.onProgress] - Progress callback(current, total).
 * @param {number} [options.startIndex=0] - Segment index to resume from.
 * @param {Blob[]} [options.existingBlobs=[]] - Already-synthesized blobs.
 * @param {Function} [options.onCheckpoint] - Called with checkpoint data after each segment.
 * @returns {Promise<Blob>} Concatenated MP3 blob.
 */
export async function generateChapterAudio(options = {}) {
  _cancelled = false;
  const {
    originalText,
    translatedText,
    audioMode = 'original',
    voiceEn = 'en-US-ChristopherNeural',
    voiceZh = 'zh-CN-YunyangNeural',
    speechRateEn = 0,
    speechRateZh = 0,
    onProgress,
    startIndex = 0,
    existingBlobs = [],
    onCheckpoint,
  } = options;

  const segments = buildChapterSegments({ originalText, translatedText, audioMode });
  if (segments.length === 0 && existingBlobs.length === 0) {
    throw new Error(`No content to synthesize in "${audioMode}" mode. Translation may be required.`);
  }
  const total = segments.length;
  const audioBlobs = [...existingBlobs];

  for (let i = startIndex; i < segments.length; i++) {
    if (_cancelled) throw new Error('Audio generation cancelled');

    const seg = segments[i];
    let voice = seg.lang === 'zh' ? voiceZh : voiceEn;
    let speechRate = seg.lang === 'zh' ? speechRateZh : speechRateEn;

    let blob;
    for (let attempt = 0; attempt <= SYNTH_MAX_RETRIES; attempt++) {
      try {
        blob = await synthesizeText(seg.text, { voice, speechRate });
        break;
      } catch (err) {
        // On "no audio" error, try the other voice as fallback
        // This handles mismatches where text language doesn't match voice
        if (attempt === 0 && err.message.includes('returned no audio')) {
          const fallbackVoice = voice === voiceZh ? voiceEn : voiceZh;
          const fallbackRate = voice === voiceZh ? speechRateEn : speechRateZh;
          try {
            blob = await synthesizeText(seg.text, { voice: fallbackVoice, speechRate: fallbackRate });
            break;
          } catch { /* Fall through to normal retry */ }
        }
        if (attempt === SYNTH_MAX_RETRIES || _cancelled) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    audioBlobs.push(blob);
    if (onProgress) onProgress(i + 1, total);
    if (onCheckpoint) onCheckpoint({ completedIndex: i + 1, totalSegments: total, audioBlobs });
  }

  const finalBlob = new Blob(audioBlobs, { type: 'audio/mpeg' });
  // Release segment blobs to free memory — the final blob owns the data now
  audioBlobs.length = 0;
  return finalBlob;
}

/**
 * Split text into sentences for paragraph-level synthesis.
 */
export function splitIntoSentences(text) {
  if (!text.trim()) return [];
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z""])|(?<=[.!?])$/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Validate that voice settings are compatible with the audio mode and content.
 * Returns a warning message if there's a potential mismatch, null otherwise.
 *
 * @param {object} options - { audioMode, voiceEn, voiceZh, hasTranslation, targetLang }
 * @returns {string|null}
 */
export function validateVoiceSettings({ audioMode, voiceEn, voiceZh, hasTranslation, targetLang }) {
  const enLang = langFromVoice(voiceEn);
  const zhLang = langFromVoice(voiceZh);

  if (audioMode === 'translated' && !hasTranslation) {
    return 'Chapter has not been translated yet. Translate first or switch to "Original" mode.';
  }

  if (audioMode === 'translated' && targetLang?.startsWith('zh') && !zhLang.startsWith('zh')) {
    return `Chinese translation will be read by voice "${voiceZh}" which is not a Chinese voice. Select a Chinese voice in settings.`;
  }

  if (audioMode === 'translated' && !targetLang?.startsWith('zh') && targetLang === 'en' && !enLang.startsWith('en')) {
    return `English translation will be read by voice "${voiceEn}" which is not an English voice. Select an English voice in settings.`;
  }

  return null;
}

/**
 * Cancel an in-progress audio generation.
 */
export function cancelGeneration() {
  _cancelled = true;
  if (_activeWebSocket) {
    _activeWebSocket.close();
    _activeWebSocket = null;
  }
}
