import { describe, expect, it } from 'vitest';
import { hasReasoning, reasoningToString } from './reasoning';
import type { ReasoningContent } from '@promptfoo/types';

describe('reasoning utilities', () => {
  describe('reasoningToString', () => {
    it('returns an empty string when reasoning is missing', () => {
      expect(reasoningToString(undefined)).toBe('');
      expect(reasoningToString([])).toBe('');
    });

    it('extracts Anthropic thinking content', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'thinking', thinking: 'Analyzing the prompt...' },
      ];

      expect(reasoningToString(reasoning)).toBe('Analyzing the prompt...');
    });

    it('redacts redacted thinking blocks', () => {
      const reasoning: ReasoningContent[] = [{ type: 'redacted_thinking', data: 'base64data' }];

      expect(reasoningToString(reasoning)).toBe('[Redacted]');
    });

    it('extracts OpenAI reasoning content', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'reasoning', content: 'Compare the candidate answers.' },
      ];

      expect(reasoningToString(reasoning)).toBe('Compare the candidate answers.');
    });

    it('extracts Gemini thought content', () => {
      const reasoning: ReasoningContent[] = [{ type: 'thought', thought: 'Check constraints.' }];

      expect(reasoningToString(reasoning)).toBe('Check constraints.');
    });

    it('extracts DeepSeek think content', () => {
      const reasoning: ReasoningContent[] = [{ type: 'think', content: 'Plan the response.' }];

      expect(reasoningToString(reasoning)).toBe('Plan the response.');
    });

    it('joins non-empty reasoning blocks with double newlines', () => {
      const reasoning: ReasoningContent[] = [
        { type: 'thinking', thinking: 'First' },
        { type: 'thinking', thinking: '' },
        { type: 'reasoning', content: 'Second' },
        { type: 'redacted_thinking', data: 'secret' },
      ];

      expect(reasoningToString(reasoning)).toBe('First\n\nSecond\n\n[Redacted]');
    });
  });

  describe('hasReasoning', () => {
    it('checks whether any reasoning blocks are present', () => {
      expect(hasReasoning(undefined)).toBe(false);
      expect(hasReasoning([])).toBe(false);
      expect(hasReasoning([{ type: 'thinking', thinking: '' }])).toBe(true);
    });
  });
});
