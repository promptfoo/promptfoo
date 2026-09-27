import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted() + vi.mock() instead of vi.resetModules() + vi.doMock() + dynamic import.
// The old pattern re-imported the entire assertions module (~90 imports) for each test,
// which caused timeouts on Windows due to slow module resolution.
const mockHandleMeteorAssertion = vi.hoisted(() => vi.fn());

vi.mock('../../src/assertions/meteor', () => ({
  handleMeteorAssertion: mockHandleMeteorAssertion,
}));

import { runAssertion } from '../../src/assertions';

describe('METEOR assertion', () => {
  beforeEach(() => {
    mockHandleMeteorAssertion.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use the handleMeteorAssertion when natural is available', async () => {
    mockHandleMeteorAssertion.mockResolvedValue({
      pass: true,
      score: 0.85,
      reason: 'METEOR test passed',
      assertion: { type: 'meteor' },
    });

    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: {} as any,
      assertion: {
        type: 'meteor',
        value: 'Expected output',
        threshold: 0.7,
      },
      test: {} as any,
      providerResponse: { output: 'Actual output' },
    });

    // Verify the mock was called and the result is as expected
    expect(mockHandleMeteorAssertion).toHaveBeenCalledWith(expect.anything());
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.85);
    expect(result.reason).toBe('METEOR test passed');
  });

  it('handles the loader missing-package error', async () => {
    const message =
      'The "natural" package is required for METEOR assertions. Install it alongside Promptfoo: npm install promptfoo natural@^8.1.1.';
    mockHandleMeteorAssertion.mockRejectedValue(new Error(message));

    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: {} as any,
      assertion: {
        type: 'meteor',
        value: 'Expected output',
        threshold: 0.7,
      },
      test: {} as any,
      providerResponse: { output: 'Actual output' },
    });

    // Verify the error is handled correctly and returns a friendly message
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe(
      'METEOR assertion requires the natural package. Install it alongside Promptfoo: npm install promptfoo natural@^8.1.1. For a global installation, use npm install -g promptfoo natural@^8.1.1.',
    );
    expect(result.assertion).toEqual({
      type: 'meteor',
      value: 'Expected output',
      threshold: 0.7,
    });
  });

  it('returns an actionable failure for an incompatible Natural version', async () => {
    const message =
      'METEOR requires natural@^8.1.1; found 7.1.0. Install it alongside Promptfoo: npm install promptfoo natural@^8.1.1.';
    mockHandleMeteorAssertion.mockRejectedValue(new Error(message));
    const assertion = { type: 'meteor' as const, value: 'expected' };
    const result = await runAssertion({
      prompt: 'Test prompt',
      provider: {} as any,
      assertion,
      test: {} as any,
      providerResponse: { output: 'actual' },
    });
    expect(result).toMatchObject({ pass: false, score: 0, reason: message, assertion });
  });

  it.each(['Some other error', "Cannot find module 'natural-binding'"])(
    'preserves unexpected handler errors: %s',
    async (message) => {
      const error = Object.assign(new Error(message), { code: 'MODULE_NOT_FOUND' });
      mockHandleMeteorAssertion.mockRejectedValue(error);

      await expect(
        runAssertion({
          prompt: 'Test prompt',
          provider: {} as any,
          assertion: {
            type: 'meteor',
            value: 'Expected output',
            threshold: 0.7,
          },
          test: {} as any,
          providerResponse: { output: 'Actual output' },
        }),
      ).rejects.toBe(error);
    },
  );
});
