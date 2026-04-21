import { describe, expect, it } from 'vitest';
import { groqSupportsTemperature, isGroqReasoningModel } from '../../../src/providers/groq/index';

describe('Groq utility functions', () => {
  describe('isGroqReasoningModel', () => {
    it('should identify deepseek-r1 models as reasoning', () => {
      expect(isGroqReasoningModel('deepseek-r1-distill-llama-70b')).toBe(true);
      expect(isGroqReasoningModel('deepseek-r1')).toBe(true);
    });

    it('should identify gpt-oss models as reasoning', () => {
      expect(isGroqReasoningModel('openai/gpt-oss-120b')).toBe(true);
      expect(isGroqReasoningModel('openai/gpt-oss-20b')).toBe(true);
      expect(isGroqReasoningModel('gpt-oss-safeguard')).toBe(true);
    });

    it('should identify qwen models as reasoning', () => {
      expect(isGroqReasoningModel('qwen/qwen3-32b')).toBe(true);
      expect(isGroqReasoningModel('qwen-2.5')).toBe(true);
    });

    it('should not identify regular models as reasoning', () => {
      expect(isGroqReasoningModel('llama-3.3-70b-versatile')).toBe(false);
      expect(isGroqReasoningModel('mixtral-8x7b-32768')).toBe(false);
      expect(isGroqReasoningModel('gemma2-9b-it')).toBe(false);
    });
  });

  describe('groqSupportsTemperature', () => {
    it('should return true for groq reasoning models', () => {
      expect(groqSupportsTemperature('deepseek-r1-distill-llama-70b')).toBe(true);
      expect(groqSupportsTemperature('openai/gpt-oss-120b')).toBe(true);
      expect(groqSupportsTemperature('qwen/qwen3-32b')).toBe(true);
    });

    it('should return false for non-reasoning models', () => {
      // Note: groqSupportsTemperature returns false for non-reasoning models
      // because it only checks if it's a Groq reasoning model.
      // Regular models still support temperature via the parent class.
      expect(groqSupportsTemperature('llama-3.3-70b-versatile')).toBe(false);
      expect(groqSupportsTemperature('mixtral-8x7b-32768')).toBe(false);
    });
  });
});
