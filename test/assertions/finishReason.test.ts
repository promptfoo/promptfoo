import { describe, expect, it } from '@jest/globals';
import { handleFinishReason } from '../../src/assertions/finishReason';

import type { AssertionParams } from '../../src/types';

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
});
