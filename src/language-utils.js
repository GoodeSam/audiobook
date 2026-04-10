/**
 * Language detection utilities.
 *
 * Classifies text as Chinese or English for dual-voice TTS routing.
 */

/**
 * Check if a character is a CJK unified ideograph.
 * @param {string} char - Single character.
 * @returns {boolean}
 */
export function isChinese(char) {
  const code = char.codePointAt(0);
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified Ideographs
    (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
    (code >= 0xF900 && code <= 0xFAFF) ||   // CJK Compatibility Ideographs
    (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
    (code >= 0x2A700 && code <= 0x2B73F) || // CJK Extension C
    (code >= 0x2B740 && code <= 0x2B81F) || // CJK Extension D
    (code >= 0x2B820 && code <= 0x2CEAF)    // CJK Extension E
  );
}

/**
 * Detect the dominant language of text.
 * @param {string} text
 * @returns {'zh'|'en'}
 */
export function detectLanguage(text) {
  let chineseChars = 0;
  let totalChars = 0;

  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    totalChars++;
    if (isChinese(ch)) chineseChars++;
  }

  if (totalChars === 0) return 'en';
  return chineseChars / totalChars > 0.3 ? 'zh' : 'en';
}

/**
 * Split text into contiguous language segments.
 * Adjacent characters of the same detected language are grouped together.
 * Punctuation and spaces are attached to the preceding segment.
 *
 * @param {string} text
 * @returns {Array<{text: string, lang: 'zh'|'en'}>}
 */
export function splitByLanguage(text) {
  if (!text) return [];

  const segments = [];
  let currentText = '';
  let currentLang = null;

  function flush() {
    if (currentText) {
      segments.push({ text: currentText, lang: currentLang || 'en' });
      currentText = '';
    }
  }

  // Iterate by code point to handle non-BMP characters (CJK Extension B+)
  for (const ch of text) {
    // Digits, whitespace, and punctuation are neutral — they attach to the
    // surrounding language context instead of forcing an English segment.
    const isNeutral = /[\s\d]/.test(ch) || (!isChinese(ch) && /[^\w]/.test(ch));

    if (isNeutral) {
      // Neutral characters: look ahead to determine affinity
      currentText += ch;
      continue;
    }

    const charLang = isChinese(ch) ? 'zh' : 'en';

    if (currentLang === null) {
      currentLang = charLang;
      currentText += ch;
    } else if (charLang === currentLang) {
      currentText += ch;
    } else {
      // Language switch: flush current segment
      flush();
      currentLang = charLang;
      currentText = ch;
    }
  }

  flush();
  return segments;
}
