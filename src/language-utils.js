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
// English segments shorter than this word count are merged into surrounding
// Chinese context. Handles names (Apple, Google), brands (iPhone),
// abbreviations (MIT, CEO), and short terms naturally read by Chinese TTS.
const MERGE_THRESHOLD_WORDS = 5;

export function splitByLanguage(text) {
  if (!text) return [];

  // Step 1: Raw character-level split
  const rawSegments = [];
  let currentText = '';
  let currentLang = null;

  function flush() {
    if (currentText) {
      rawSegments.push({ text: currentText, lang: currentLang || 'en' });
      currentText = '';
    }
  }

  for (const ch of text) {
    const isNeutral = /[\s\d]/.test(ch) || (!isChinese(ch) && /[^\w]/.test(ch));

    if (isNeutral) {
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
      flush();
      currentLang = charLang;
      currentText = ch;
    }
  }

  flush();

  // Step 2: Merge short English segments into surrounding Chinese context.
  // Short English words (names, brands, abbreviations) embedded in Chinese
  // should be read by the Chinese voice, which handles them naturally.
  if (rawSegments.length <= 1) return rawSegments;

  const merged = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];

    if (seg.lang === 'en' && shouldMergeIntoChineseContext(seg, i, rawSegments)) {
      // Merge into previous Chinese segment or start a new one
      if (merged.length > 0 && merged[merged.length - 1].lang === 'zh') {
        merged[merged.length - 1].text += seg.text;
      } else {
        merged.push({ text: seg.text, lang: 'zh' });
      }
    } else {
      // Try to merge with previous segment of same language
      if (merged.length > 0 && merged[merged.length - 1].lang === seg.lang) {
        merged[merged.length - 1].text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }
  }

  return merged;
}

/**
 * Determine if a short English segment should be merged into Chinese context.
 * Returns true for names, brands, abbreviations, and short terms that Chinese
 * TTS voices handle naturally.
 */
function shouldMergeIntoChineseContext(seg, index, allSegments) {
  const wordCount = seg.text.trim().split(/\s+/).length;
  if (wordCount > MERGE_THRESHOLD_WORDS) return false;

  // Check if surrounded by Chinese segments (before or after)
  const prev = index > 0 ? allSegments[index - 1] : null;
  const next = index < allSegments.length - 1 ? allSegments[index + 1] : null;
  const prevIsChinese = prev?.lang === 'zh';
  const nextIsChinese = next?.lang === 'zh';

  // Merge if at least one neighbor is Chinese
  return prevIsChinese || nextIsChinese;
}
