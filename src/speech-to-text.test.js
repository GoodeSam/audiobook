import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isSpeechRecognitionSupported, createSpeechRecognition, toSpeechLang } from './speech-to-text.js';

describe('speech-to-text', () => {
  describe('isSpeechRecognitionSupported', () => {
    afterEach(() => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    });

    it('returns false when no API exists', () => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
      expect(isSpeechRecognitionSupported()).toBe(false);
    });

    it('returns true when SpeechRecognition exists', () => {
      window.SpeechRecognition = vi.fn();
      expect(isSpeechRecognitionSupported()).toBe(true);
    });

    it('returns true when webkitSpeechRecognition exists', () => {
      window.webkitSpeechRecognition = vi.fn();
      expect(isSpeechRecognitionSupported()).toBe(true);
    });
  });

  describe('createSpeechRecognition', () => {
    let MockRecognition;

    beforeEach(() => {
      MockRecognition = vi.fn(function () {
        this.lang = '';
        this.continuous = false;
        this.interimResults = false;
        this.onresult = null;
        this.onerror = null;
        this.onend = null;
        this.start = vi.fn();
        this.stop = vi.fn();
      });
      window.SpeechRecognition = MockRecognition;
    });

    afterEach(() => {
      delete window.SpeechRecognition;
    });

    it('creates a recognition session with correct options', () => {
      const onResult = vi.fn();
      const session = createSpeechRecognition({ lang: 'zh-CN', onResult });
      expect(session.recognition.lang).toBe('zh-CN');
      expect(session.recognition.continuous).toBe(true);
      expect(session.recognition.interimResults).toBe(true);
    });

    it('start/stop call through to recognition', () => {
      const session = createSpeechRecognition({ onResult: vi.fn() });
      session.start();
      expect(session.recognition.start).toHaveBeenCalled();
      session.stop();
      expect(session.recognition.stop).toHaveBeenCalled();
    });

    it('throws when no API available', () => {
      delete window.SpeechRecognition;
      expect(() => createSpeechRecognition({ onResult: vi.fn() }))
        .toThrow('Speech recognition not supported');
    });

    it('calls onResult with final transcript', () => {
      const onResult = vi.fn();
      const session = createSpeechRecognition({ onResult });
      // Simulate a final result
      session.recognition.onresult({
        resultIndex: 0,
        results: [{ 0: { transcript: 'hello world' }, isFinal: true, length: 1 }],
      });
      expect(onResult).toHaveBeenCalledWith('hello world', true);
    });

    it('calls onResult with interim transcript', () => {
      const onResult = vi.fn();
      const session = createSpeechRecognition({ onResult });
      session.recognition.onresult({
        resultIndex: 0,
        results: [{ 0: { transcript: 'hel' }, isFinal: false, length: 1 }],
      });
      expect(onResult).toHaveBeenCalledWith('hel', false);
    });

    it('calls onEnd when recognition stops', () => {
      const onEnd = vi.fn();
      const session = createSpeechRecognition({ onResult: vi.fn(), onEnd });
      session.recognition.onend();
      expect(onEnd).toHaveBeenCalled();
    });

    it('calls onError on recognition error', () => {
      const onError = vi.fn();
      const session = createSpeechRecognition({ onResult: vi.fn(), onError });
      session.recognition.onerror({ error: 'not-allowed' });
      expect(onError).toHaveBeenCalledWith({ error: 'not-allowed' });
    });
  });

  describe('toSpeechLang', () => {
    it('maps zh-Hans to zh-CN', () => {
      expect(toSpeechLang('zh-Hans')).toBe('zh-CN');
    });

    it('maps en to en-US', () => {
      expect(toSpeechLang('en')).toBe('en-US');
    });

    it('passes through unknown codes', () => {
      expect(toSpeechLang('vi-VN')).toBe('vi-VN');
    });
  });
});
