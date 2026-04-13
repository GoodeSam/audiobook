/**
 * Speech-to-text module — browser-native speech recognition.
 *
 * Uses the Web Speech API (SpeechRecognition) for real-time microphone
 * transcription. Works in Chrome, Edge, and Safari. No external API or
 * key required — all processing happens locally or via the browser's
 * built-in speech service.
 */

/**
 * Check if speech recognition is supported in this browser.
 * @returns {boolean}
 */
export function isSpeechRecognitionSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Create and configure a speech recognition session.
 *
 * @param {object} options
 * @param {string} [options.lang='en-US'] - BCP 47 language code.
 * @param {boolean} [options.continuous=true] - Keep listening after pauses.
 * @param {boolean} [options.interimResults=true] - Emit partial results.
 * @param {function} options.onResult - Called with (transcript, isFinal).
 * @param {function} [options.onEnd] - Called when recognition stops.
 * @param {function} [options.onError] - Called with error event.
 * @returns {{ start: function, stop: function, recognition: SpeechRecognition }}
 */
export function createSpeechRecognition(options) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    throw new Error('Speech recognition not supported in this browser');
  }

  const recognition = new SpeechRecognition();
  recognition.lang = options.lang || 'en-US';
  recognition.continuous = options.continuous !== false;
  recognition.interimResults = options.interimResults !== false;

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalTranscript += result[0].transcript;
      } else {
        interimTranscript += result[0].transcript;
      }
    }

    if (finalTranscript) {
      options.onResult(finalTranscript, true);
    } else if (interimTranscript) {
      options.onResult(interimTranscript, false);
    }
  };

  recognition.onerror = (event) => {
    if (options.onError) options.onError(event);
  };

  recognition.onend = () => {
    if (options.onEnd) options.onEnd();
  };

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    recognition,
  };
}

/** Map UI language codes to BCP 47 speech recognition codes. */
const LANG_MAP = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  'en': 'en-US',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'es': 'es-ES',
  'fr': 'fr-FR',
  'de': 'de-DE',
  'pt': 'pt-BR',
  'ru': 'ru-RU',
  'ar': 'ar-SA',
};

/**
 * Convert the app's translate-language code to a speech recognition language.
 * @param {string} langCode - App language code (e.g. 'zh-Hans').
 * @returns {string} BCP 47 language code for speech recognition.
 */
export function toSpeechLang(langCode) {
  return LANG_MAP[langCode] || langCode;
}
