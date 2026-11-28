import { describe, expect, it } from 'vitest';
import { handleFinishReason } from '../../src/assertions/finishReason';

import type { AssertionParams } from '../../src/types/index';

describe('finishReason assertion', () => {
  it('should pass when finish reason matches', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      providerResponse: { finishReason: 'stop' },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should fail when stop reason does not match', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      providerResponse: { finishReason: 'length' },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should fail when provider does not return stop reason', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      providerResponse: {},
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('did not supply');
  });

  it('should handle renderedValue override', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      renderedValue: 'length',
      providerResponse: { finishReason: 'length' },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should prioritize renderedValue over assertion.value', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      renderedValue: 'length',
      providerResponse: { finishReason: 'stop' },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('Expected finish reason "length" but got "stop"');
  });

  it('should throw for non-string assertion value', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 123 as any },
      providerResponse: { finishReason: 'stop' },
    };

    expect(() => handleFinishReason(params as AssertionParams)).toThrow(
      '"finish-reason" assertion type must have a string value',
    );
  });

  it('should throw for non-string renderedValue', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      renderedValue: 123 as any,
      providerResponse: { finishReason: 'stop' },
    };

    expect(() => handleFinishReason(params as AssertionParams)).toThrow(
      '"finish-reason" assertion type must have a string value',
    );
  });

  it('should handle undefined finishReason gracefully', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      providerResponse: { finishReason: undefined },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toContain('did not supply');
  });

  it('should perform case-insensitive matching', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'stop' },
      providerResponse: { finishReason: 'STOP' }, // Different case
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(true); // Now passes with case-insensitive comparison
    expect(result.score).toBe(1);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should handle mixed case in both assertion and response', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'finish-reason', value: 'LENGTH' },
      providerResponse: { finishReason: 'length' },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should invert result when inverse is true (not-finish-reason)', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'not-finish-reason' as any, value: 'stop' },
      inverse: true,
      providerResponse: { finishReason: 'stop' },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should pass when inverse is true and finish reason does not match', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'not-finish-reason' as any, value: 'stop' },
      inverse: true,
      providerResponse: { finishReason: 'length' },
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should pass when inverse is true and provider has no finish reason', () => {
    const params: Partial<AssertionParams> = {
      assertion: { type: 'not-finish-reason' as any, value: 'stop' },
      inverse: true,
      providerResponse: {},
    };

    const result = handleFinishReason(params as AssertionParams);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  describe('provider-specific finish reason normalization', () => {
    it('should treat Anthropic end_turn as stop', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'finish-reason', value: 'stop' },
        providerResponse: { finishReason: 'end_turn' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(true);
    });

    it('should treat Anthropic max_tokens as length', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'finish-reason', value: 'length' },
        providerResponse: { finishReason: 'max_tokens' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(true);
    });

    it('should treat Anthropic tool_use as tool_calls', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'finish-reason', value: 'tool_calls' },
        providerResponse: { finishReason: 'tool_use' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(true);
    });

    it('should not invert for end_turn when inverse is true and value is stop', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'not-finish-reason' as any, value: 'stop' },
        inverse: true,
        providerResponse: { finishReason: 'end_turn' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(false);
    });

    it('should not invert for max_tokens when inverse is true and value is length', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'not-finish-reason' as any, value: 'length' },
        inverse: true,
        providerResponse: { finishReason: 'max_tokens' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(false);
    });

    it('should not invert for tool_use when inverse is true and value is tool_calls', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'not-finish-reason' as any, value: 'tool_calls' },
        inverse: true,
        providerResponse: { finishReason: 'tool_use' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(false);
    });

    it('should normalize a provider-specific value on the assertion side too', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'finish-reason', value: 'end_turn' },
        providerResponse: { finishReason: 'stop' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(true);
    });

    it('should keep raw provider strings in the failure message', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'finish-reason', value: 'stop' },
        providerResponse: { finishReason: 'tool_use' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Expected finish reason "stop" but got "tool_use"');
    });

    it('should report no finish reason when normalization yields undefined', () => {
      const params: Partial<AssertionParams> = {
        assertion: { type: 'finish-reason', value: 'stop' },
        providerResponse: { finishReason: '   ' },
      };

      const result = handleFinishReason(params as AssertionParams);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('did not supply');
    });
  });
});
