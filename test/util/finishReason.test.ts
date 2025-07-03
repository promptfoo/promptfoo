import { describe, expect, it } from '@jest/globals';
import { normalizeFinishReason } from '../../src/util/finishReason';

describe('normalizeFinishReason', () => {
  describe('OpenAI mappings', () => {
    it('should pass through OpenAI standard reasons unchanged', () => {
      expect(normalizeFinishReason('stop')).toBe('stop');
      expect(normalizeFinishReason('length')).toBe('length');
      expect(normalizeFinishReason('content_filter')).toBe('content_filter');
      expect(normalizeFinishReason('tool_calls')).toBe('tool_calls');
    });

    it('should map function_call to tool_calls', () => {
      expect(normalizeFinishReason('function_call')).toBe('tool_calls');
    });
  });

  describe('Anthropic mappings', () => {
    it('should normalize Anthropic reasons to standard values', () => {
      expect(normalizeFinishReason('end_turn')).toBe('stop');
      expect(normalizeFinishReason('stop_sequence')).toBe('stop');
      expect(normalizeFinishReason('max_tokens')).toBe('length');
      expect(normalizeFinishReason('tool_use')).toBe('tool_calls');
    });
  });

  describe('case normalization', () => {
    it('should handle uppercase input', () => {
      expect(normalizeFinishReason('STOP')).toBe('stop');
      expect(normalizeFinishReason('LENGTH')).toBe('length');
      expect(normalizeFinishReason('END_TURN')).toBe('stop');
    });

    it('should handle mixed case input', () => {
      expect(normalizeFinishReason('Stop')).toBe('stop');
      expect(normalizeFinishReason('Length')).toBe('length');
      expect(normalizeFinishReason('End_Turn')).toBe('stop');
    });
  });

  describe('edge cases', () => {
    it('should handle null and undefined', () => {
      expect(normalizeFinishReason(null)).toBeUndefined();
      expect(normalizeFinishReason(undefined)).toBeUndefined();
    });

    it('should handle empty and whitespace strings', () => {
      expect(normalizeFinishReason('')).toBeUndefined();
      expect(normalizeFinishReason('   ')).toBeUndefined();
      expect(normalizeFinishReason('\t\n')).toBeUndefined();
    });

    it('should handle non-string input', () => {
      expect(normalizeFinishReason(123 as any)).toBeUndefined();
      expect(normalizeFinishReason({} as any)).toBeUndefined();
      expect(normalizeFinishReason([] as any)).toBeUndefined();
    });

    it('should trim whitespace', () => {
      expect(normalizeFinishReason('  stop  ')).toBe('stop');
      expect(normalizeFinishReason('\tlength\n')).toBe('length');
    });
  });

  describe('unmapped reasons', () => {
    it('should pass through unknown reasons unchanged', () => {
      expect(normalizeFinishReason('unknown_reason')).toBe('unknown_reason');
      expect(normalizeFinishReason('custom_stop')).toBe('custom_stop');
    });

    it('should preserve case for unknown reasons after normalization', () => {
      expect(normalizeFinishReason('CUSTOM_REASON')).toBe('custom_reason');
    });
  });
});
