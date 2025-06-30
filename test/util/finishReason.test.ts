import { normalizeFinishReason, FINISH_REASON_MAP } from '../../src/util/finishReason';

describe('finishReason', () => {
  describe('normalizeFinishReason', () => {
    it('should return undefined for null input', () => {
      expect(normalizeFinishReason(null)).toBeUndefined();
    });

    it('should return undefined for undefined input', () => {
      expect(normalizeFinishReason(undefined)).toBeUndefined();
    });

    it('should normalize OpenAI finish reasons', () => {
      expect(normalizeFinishReason('stop')).toBe('stop');
      expect(normalizeFinishReason('length')).toBe('length');
      expect(normalizeFinishReason('content_filter')).toBe('content_filter');
      expect(normalizeFinishReason('tool_calls')).toBe('tool_calls');
      expect(normalizeFinishReason('function_call')).toBe('tool_calls');
    });

    it('should normalize Anthropic finish reasons', () => {
      expect(normalizeFinishReason('end_turn')).toBe('stop');
      expect(normalizeFinishReason('stop_sequence')).toBe('stop');
      expect(normalizeFinishReason('max_tokens')).toBe('length');
      expect(normalizeFinishReason('tool_use')).toBe('tool_calls');
    });

    it('should handle case insensitivity', () => {
      expect(normalizeFinishReason('STOP')).toBe('stop');
      expect(normalizeFinishReason('Length')).toBe('length');
      expect(normalizeFinishReason('CONTENT_FILTER')).toBe('content_filter');
    });

    it('should return original value if not mapped', () => {
      expect(normalizeFinishReason('unknown_reason')).toBe('unknown_reason');
      expect(normalizeFinishReason('custom')).toBe('custom');
    });
  });

  describe('FINISH_REASON_MAP', () => {
    it('should contain all expected mappings', () => {
      expect(FINISH_REASON_MAP).toEqual({
        stop: 'stop',
        length: 'length',
        content_filter: 'content_filter',
        tool_calls: 'tool_calls',
        function_call: 'tool_calls',
        end_turn: 'stop',
        stop_sequence: 'stop',
        max_tokens: 'length',
        tool_use: 'tool_calls',
      });
    });
  });
});
