import { describe, expect, it } from 'vitest';
import {
  combineReasoningAndOutput,
  getReasoningTokens,
  hasReasoning,
  reasoningToString,
} from '../../src/util/reasoning';

import type { ProviderResponse, ReasoningContent } from '../../src/types/providers';

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
      const thinking = {
        output: 'test',
        reasoning: [{ type: 'thinking' as const, thinking: 'test' }],
      };
      const redacted = {
        output: 'test',
        reasoning: [{ type: 'redacted_thinking' as const, data: 'test' }],
      };
      const reasoning = {
        output: 'test',
        reasoning: [{ type: 'reasoning' as const, content: 'test' }],
      };
      const thought = {
        output: 'test',
        reasoning: [{ type: 'thought' as const, thought: 'test' }],
      };
      const think = { output: 'test', reasoning: [{ type: 'think' as const, content: 'test' }] };

      expect(hasReasoning(thinking)).toBe(true);
      expect(hasReasoning(redacted)).toBe(true);
      expect(hasReasoning(reasoning)).toBe(true);
      expect(hasReasoning(thought)).toBe(true);
      expect(hasReasoning(think)).toBe(true);
    });
  });

  describe('getReasoningTokens', () => {
    it('should return undefined for undefined response', () => {
      expect(getReasoningTokens(undefined)).toBeUndefined();
    });

    it('should return undefined when reasoning token usage is absent', () => {
      expect(getReasoningTokens({ output: 'test' })).toBeUndefined();
    });

    it('should return reasoning token usage when present', () => {
      const response = {
        output: 'test',
        tokenUsage: {
          completionDetails: {
            reasoning: 42,
          },
        },
      } as ProviderResponse;

      expect(getReasoningTokens(response)).toBe(42);
    });
  });

  describe('combineReasoningAndOutput', () => {
    it('should return empty string for undefined response', () => {
      expect(combineReasoningAndOutput(undefined)).toBe('');
    });

    it('should combine reasoning and string output', () => {
      const response: ProviderResponse = {
        output: 'Final answer',
        reasoning: [{ type: 'reasoning', content: 'Step 1' }],
      };

      expect(combineReasoningAndOutput(response)).toBe('Reasoning: Step 1\n\nFinal answer');
    });

    it('should use a custom reasoning prefix', () => {
      const response: ProviderResponse = {
        output: 'Final answer',
        reasoning: [{ type: 'thought', thought: 'Gemini thought' }],
      };

      expect(combineReasoningAndOutput(response, 'Thinking')).toBe(
        'Thinking: Gemini thought\n\nFinal answer',
      );
    });

    it('should stringify object output', () => {
      const response = {
        output: { answer: 'Final answer' },
        reasoning: [{ type: 'think', content: 'DeepSeek thought' }],
      } as ProviderResponse;

      expect(combineReasoningAndOutput(response)).toBe(
        'Reasoning: DeepSeek thought\n\n{"answer":"Final answer"}',
      );
    });

    it('should omit null and undefined outputs', () => {
      expect(
        combineReasoningAndOutput({
          output: null,
          reasoning: [{ type: 'thinking', thinking: 'Only reasoning' }],
        } as ProviderResponse),
      ).toBe('Reasoning: Only reasoning');

      expect(
        combineReasoningAndOutput({
          output: undefined,
        } as ProviderResponse),
      ).toBe('');
    });

    it('should fall back to String when object output cannot be serialized', () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;
      const response = {
        output: circular,
        reasoning: [{ type: 'redacted_thinking', data: 'secret' }],
      } as ProviderResponse;

      expect(combineReasoningAndOutput(response)).toBe('Reasoning: [Redacted]\n\n[object Object]');
    });
  });
});
