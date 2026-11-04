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
  let params: Parameters<typeof runAssertion>[0];

  beforeEach(() => {
    mockHandleMeteorAssertion.mockReset();
    params = {
      assertion: {
        type: 'meteor',
        value: 'Expected output',
        threshold: 0.7,
      },
      test: {},
      providerResponse: { output: 'Actual output' },
    };
  });

  afterEach(() => {
    mockHandleMeteorAssertion.mockReset();
  });

  it('should use the handleMeteorAssertion when natural is available', async () => {
    mockHandleMeteorAssertion.mockResolvedValue({
      pass: true,
      score: 0.85,
      reason: 'METEOR test passed',
      assertion: params.assertion,
    });

    const result = await runAssertion(params);

    expect(mockHandleMeteorAssertion).toHaveBeenCalledWith(
      expect.objectContaining({
        assertion: params.assertion,
        renderedValue: 'Expected output',
        outputString: 'Actual output',
      }),
    );
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.85);
    expect(result.reason).toBe('METEOR test passed');
    expect(result.assertion).toBe(params.assertion);
  });

  it.each([
    "Cannot find module 'natural'",
    'The "natural" package is required for METEOR assertions. Install it with: npm install natural@^8.1.0',
  ])('should handle a rejected missing-package error: %s', async (message) => {
    mockHandleMeteorAssertion.mockRejectedValue(new Error(message));

    const result = await runAssertion(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe(
      'METEOR assertion requires the natural package. Please install it using: npm install natural@^8.1.0',
    );
    expect(result.assertion).toBe(params.assertion);
  });

  it('should rethrow other errors that are not related to missing module', async () => {
    const error = new Error('Some other error');
    mockHandleMeteorAssertion.mockRejectedValue(error);

    await expect(runAssertion(params)).rejects.toBe(error);
  });
});
