import { describe, it, expect } from 'vitest';
import { reasoningToString, hasReasoning } from '../../src/util/reasoning';
import type { ReasoningContent } from '../../src/types/providers';

describe('reasoning utilities', () => {
  describe('reasoningToString', () => {
    it('should return empty string for undefined reasoning', () => {
      expect(reasoningToString(undefined)).toBe('');
    });

    it('should return empty string for empty array', () => {
      expect(reasoningToString([])).toBe('');
    });

    it('should handle thinking type (Anthropic)', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'thinking', thinking: 'Analyzing the problem...' },
      ];
      expect(reasoningToString(reasoning)).toBe('Analyzing the problem...');
    });

    it('should handle redacted_thinking type', () => {
      const reasoning: ReasoningContent[] = [{ type: 'redacted_thinking', data: 'base64data' }];
      expect(reasoningToString(reasoning)).toBe('[Redacted]');
    });

    it('should handle reasoning type (OpenAI)', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'reasoning', content: 'Step 1: Consider the input...' },
      ];
      expect(reasoningToString(reasoning)).toBe('Step 1: Consider the input...');
    });

    it('should handle thought type (Gemini)', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'thought', thought: 'Let me think about this...' },
      ];
      expect(reasoningToString(reasoning)).toBe('Let me think about this...');
    });

    it('should handle think type (DeepSeek)', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'think', content: 'Processing the request...' },
      ];
      expect(reasoningToString(reasoning)).toBe('Processing the request...');
    });

    it('should join multiple reasoning blocks with double newlines', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'thinking', thinking: 'First thought' },
        { type: 'thinking', thinking: 'Second thought' },
      ];
      expect(reasoningToString(reasoning)).toBe('First thought\n\nSecond thought');
    });

    it('should handle mixed reasoning types', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'thinking', thinking: 'Analyzing...' },
        { type: 'redacted_thinking', data: 'secret' },
        { type: 'thinking', thinking: 'Conclusion...' },
      ];
      expect(reasoningToString(reasoning)).toBe('Analyzing...\n\n[Redacted]\n\nConclusion...');
    });

    it('should filter out empty content', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'thinking', thinking: 'First thought' },
        { type: 'thinking', thinking: '' },
        { type: 'thinking', thinking: 'Second thought' },
      ];
      expect(reasoningToString(reasoning)).toBe('First thought\n\nSecond thought');
    });
  });

  describe('hasReasoning', () => {
    it('should return false for undefined response', () => {
      expect(hasReasoning(undefined)).toBe(false);
    });

    it('should return false for response without reasoning', () => {
      expect(hasReasoning({ output: 'test' })).toBe(false);
    });

    it('should return false for response with empty reasoning array', () => {
      expect(hasReasoning({ output: 'test', reasoning: [] })).toBe(false);
    });

    it('should return true for response with reasoning content', () => {
      const response = {
        output: 'test',
        reasoning: [{ type: 'thinking' as const, thinking: 'Some thought' }],
      };
      expect(hasReasoning(response)).toBe(true);
    });

    it('should return true for response with any reasoning type', () => {
      const thinking = { output: 'test', reasoning: [{ type: 'thinking' as const, thinking: 'test' }] };
      const redacted = { output: 'test', reasoning: [{ type: 'redacted_thinking' as const, data: 'test' }] };
      const reasoning = { output: 'test', reasoning: [{ type: 'reasoning' as const, content: 'test' }] };
      const thought = { output: 'test', reasoning: [{ type: 'thought' as const, thought: 'test' }] };
      const think = { output: 'test', reasoning: [{ type: 'think' as const, content: 'test' }] };

      expect(hasReasoning(thinking)).toBe(true);
      expect(hasReasoning(redacted)).toBe(true);
      expect(hasReasoning(reasoning)).toBe(true);
      expect(hasReasoning(thought)).toBe(true);
      expect(hasReasoning(think)).toBe(true);
    });
  });
});
