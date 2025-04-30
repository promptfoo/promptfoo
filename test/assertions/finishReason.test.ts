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
});
