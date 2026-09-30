import { describe, expect, it } from 'vitest';
import { handleTtft } from '../../src/assertions/latency';

import type { AssertionParams } from '../../src/types';

function params(ttft: number | undefined, threshold: number, inverse = false): AssertionParams {
  return {
    assertion: { type: inverse ? 'not-ttft' : 'ttft', threshold },
    inverse,
    providerResponse: { streamingMetrics: { timeToFirstToken: ttft } },
  } as AssertionParams;
}

describe('ttft assertion', () => {
  it.each([
    [0, 0, false, true],
    [500, 1000, false, true],
    [1000, 1000, false, true],
    [1500, 1000, false, false],
    [567.89, 567.8, false, false],
    [500, 1000, true, false],
    [1000, 1000, true, false],
    [1500, 1000, true, true],
  ])('grades %dms against %dms (inverse=%s)', (ttft, threshold, inverse, pass) => {
    const input = params(ttft, threshold, inverse);
    const result = handleTtft(input);
    expect(result.pass).toBe(pass);
    expect(result.score).toBe(Number(pass));
    expect(result.assertion).toBe(input.assertion);
    expect(result.reason).toContain(`${ttft}ms`);
    expect(result.namedScores).toBeUndefined();
  });

  it.each([-1, NaN, Infinity, undefined, '500'])('rejects invalid threshold %s', (threshold) => {
    expect(() => handleTtft(params(100, threshold as number))).toThrow(
      'non-negative number threshold',
    );
  });

  it.each([-1, NaN, Infinity])('rejects invalid metric %s', (ttft) => {
    expect(() => handleTtft(params(ttft, 1000))).toThrow('non-negative finite number');
  });

  it('explains when the stream has no text output', () => {
    expect(() => handleTtft(params(undefined, 1000))).toThrow('no matching content');
  });

  it('requires streaming metrics', () => {
    const input = params(10, 1000);
    input.providerResponse = {};
    expect(() => handleTtft(input)).toThrow('requires streaming metrics');
  });
});
