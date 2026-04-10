import { describe, it, expect } from 'vitest';
import { convertNumbersToChinese } from './number-to-chinese.js';

describe('convertNumbersToChinese', () => {
  it('converts single digits', () => {
    expect(convertNumbersToChinese('第1章')).toBe('第一章');
    expect(convertNumbersToChinese('有3个')).toBe('有三个');
  });

  it('converts multi-digit numbers', () => {
    expect(convertNumbersToChinese('第12章')).toBe('第十二章');
    expect(convertNumbersToChinese('共100页')).toBe('共一百页');
  });

  it('converts zero', () => {
    expect(convertNumbersToChinese('第0节')).toBe('第零节');
  });

  it('converts numbers in the tens', () => {
    expect(convertNumbersToChinese('10个')).toBe('十个');
    expect(convertNumbersToChinese('20人')).toBe('二十人');
    expect(convertNumbersToChinese('15天')).toBe('十五天');
  });

  it('converts numbers in the hundreds', () => {
    expect(convertNumbersToChinese('300元')).toBe('三百元');
    expect(convertNumbersToChinese('450人')).toBe('四百五十人');
    expect(convertNumbersToChinese('101个')).toBe('一百零一个');
  });

  it('converts numbers in the thousands', () => {
    expect(convertNumbersToChinese('1000年')).toBe('一千年');
    expect(convertNumbersToChinese('2024年')).toBe('二千零二十四年');
    expect(convertNumbersToChinese('5678人')).toBe('五千六百七十八人');
  });

  it('converts numbers in the ten-thousands (万)', () => {
    expect(convertNumbersToChinese('10000人')).toBe('一万人');
    expect(convertNumbersToChinese('50000元')).toBe('五万元');
    expect(convertNumbersToChinese('12345个')).toBe('一万二千三百四十五个');
  });

  it('handles large numbers with 亿', () => {
    expect(convertNumbersToChinese('100000000人')).toBe('一亿人');
  });

  it('converts multiple numbers in one string', () => {
    expect(convertNumbersToChinese('第3章第5节')).toBe('第三章第五节');
  });

  it('preserves non-numeric text', () => {
    expect(convertNumbersToChinese('你好世界')).toBe('你好世界');
    expect(convertNumbersToChinese('')).toBe('');
  });

  it('handles year-like numbers read digit by digit', () => {
    // Years are commonly read digit-by-digit in Chinese
    expect(convertNumbersToChinese('1949年')).toBe('一千九百四十九年');
  });

  it('converts decimal numbers', () => {
    expect(convertNumbersToChinese('3.14')).toBe('三点一四');
  });

  it('converts percentage numbers', () => {
    expect(convertNumbersToChinese('50%')).toBe('百分之五十');
  });
});
