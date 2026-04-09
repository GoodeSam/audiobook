/**
 * Edge TTS - Microsoft Edge Read Aloud WebSocket TTS engine.
 *
 * Ported from EasyOriginals' book-audio.js. Provides free text-to-speech
 * synthesis via the Edge browser's built-in TTS service.
 *
 * Supports 57+ voices across 30+ languages with adjustable speech rate.
 */

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

async function generateSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000);
  ticks += 11644473600;
  ticks -= ticks % 300;
  ticks *= 1e7;
  const input = `${ticks}${EDGE_TTS_TOKEN}`;
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Synthesize text into an MP3 audio Blob using Edge TTS.
 *
 * @param {string} text - Text to synthesize.
 * @param {object} options - { voice, speechRate }
 * @returns {Promise<Blob>} MP3 audio blob.
 */
export async function synthesizeText(text, options = {}) {
  const voice = options.voice || 'en-US-AriaNeural';
  const speechRate = options.speechRate || 0;
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
            reject(new Error(
              `Edge TTS returned no audio for voice "${voice}".\n` +
              `Voice language: ${langFromVoice(voice)}\n` +
              'Try selecting a voice that matches the text language.'
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
 * Split text into sentences for paragraph-level synthesis.
 * Inspired by tepub's audiobook/preprocess.py sentence segmentation.
 */
export function splitIntoSentences(text) {
  if (!text.trim()) return [];

  // Split on sentence boundaries: . ! ? followed by space + uppercase or end of string
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-Z""])|(?<=[.!?])$/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return sentences;
}

/**
 * Generate audio for a full chapter by synthesizing paragraph by paragraph.
 *
 * @param {string} text - Full chapter text (markdown stripped to plain text).
 * @param {object} options - { voice, speechRate, onProgress(current, total) }
 * @returns {Promise<Blob>} Concatenated MP3 blob.
 */
export async function generateChapterAudio(text, options = {}) {
  _cancelled = false;
  const { onProgress } = options;

  // Split into paragraphs
  const paragraphs = text
    .split(/\n\n+/)
    .map(p => p.replace(/\n/g, ' ').trim())
    .filter(p => p.length > 0 && !/^#{1,6}\s*$/.test(p)); // Skip empty headings

  const total = paragraphs.length;
  const audioBlobs = [];

  for (let i = 0; i < paragraphs.length; i++) {
    if (_cancelled) throw new Error('Audio generation cancelled');

    const para = paragraphs[i];

    // Strip markdown formatting for TTS
    const cleanText = stripMarkdown(para);
    if (!cleanText.trim()) continue;

    let blob;
    for (let attempt = 0; attempt <= SYNTH_MAX_RETRIES; attempt++) {
      try {
        blob = await synthesizeText(cleanText, options);
        break;
      } catch (err) {
        if (attempt === SYNTH_MAX_RETRIES || _cancelled) throw err;
        // Brief pause before retry
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    audioBlobs.push(blob);
    if (onProgress) onProgress(i + 1, total);
  }

  // Concatenate all MP3 blobs
  return new Blob(audioBlobs, { type: 'audio/mpeg' });
}

/**
 * Strip markdown formatting from text for cleaner TTS output.
 */
function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')          // Headings
    .replace(/\*\*(.+?)\*\*/g, '$1')       // Bold
    .replace(/\*(.+?)\*/g, '$1')           // Italic
    .replace(/`(.+?)`/g, '$1')             // Inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // Images
    .replace(/^[-*+]\s+/gm, '')            // Unordered lists
    .replace(/^\d+\.\s+/gm, '')            // Ordered lists
    .replace(/^>\s+/gm, '')                // Blockquotes
    .replace(/---+/g, '')                  // Horizontal rules
    .replace(/\|/g, '')                    // Table pipes
    .trim();
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
