/**
 * Convert Arabic numerals to Chinese characters for TTS.
 *
 * When Edge TTS uses a Chinese voice, Arabic numerals (123) are often
 * read with English pronunciation. Converting them to Chinese characters
 * (一百二十三) ensures proper Chinese vocalization.
 */

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * Convert a non-negative integer to Chinese characters.
 * @param {number} n
 * @returns {string}
 */
function intToChinese(n) {
  if (n === 0) return '零';
  if (n < 0) return n.toString();

  let result = '';

  // 亿 (100,000,000)
  if (n >= 100000000) {
    const yi = Math.floor(n / 100000000);
    result += intToChinese(yi) + '亿';
    n %= 100000000;
    if (n > 0 && n < 10000000) result += '零';
  }

  // 万 (10,000)
  if (n >= 10000) {
    const wan = Math.floor(n / 10000);
    result += intToChinese(wan) + '万';
    n %= 10000;
    if (n > 0 && n < 1000) result += '零';
  }

  // 千 (1,000)
  if (n >= 1000) {
    result += DIGITS[Math.floor(n / 1000)] + '千';
    n %= 1000;
    if (n > 0 && n < 100) result += '零';
  }

  // 百 (100)
  if (n >= 100) {
    result += DIGITS[Math.floor(n / 100)] + '百';
    n %= 100;
    if (n > 0 && n < 10) result += '零';
  }

  // 十 (10)
  if (n >= 10) {
    const tens = Math.floor(n / 10);
    // Omit 一 before 十 when it's the leading unit (e.g. 10 = 十, not 一十)
    if (tens === 1 && result === '') {
      result += '十';
    } else {
      result += DIGITS[tens] + '十';
    }
    n %= 10;
  }

  // 个位
  if (n > 0) {
    result += DIGITS[n];
  }

  return result;
}

/**
 * Convert Arabic numerals in a string to Chinese characters.
 * Handles integers, decimals (点), and percentages (百分之).
 *
 * @param {string} text
 * @returns {string}
 */
export function convertNumbersToChinese(text) {
  // Handle percentages first: 50% → 百分之五十
  text = text.replace(/(\d+(?:\.\d+)?)%/g, (_, num) => {
    return '百分之' + convertNum(num);
  });

  // Handle decimal numbers: 3.14 → 三点一四
  text = text.replace(/(\d+)\.(\d+)/g, (_, intPart, decPart) => {
    const intChinese = intToChinese(parseInt(intPart, 10));
    const decChinese = decPart.split('').map(d => DIGITS[parseInt(d, 10)]).join('');
    return intChinese + '点' + decChinese;
  });

  // Handle remaining integers
  text = text.replace(/\d+/g, (match) => {
    return intToChinese(parseInt(match, 10));
  });

  return text;
}

function convertNum(numStr) {
  if (numStr.includes('.')) {
    const [intPart, decPart] = numStr.split('.');
    const intChinese = intToChinese(parseInt(intPart, 10));
    const decChinese = decPart.split('').map(d => DIGITS[parseInt(d, 10)]).join('');
    return intChinese + '点' + decChinese;
  }
  return intToChinese(parseInt(numStr, 10));
}
