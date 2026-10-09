import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Reuse the assertion module to avoid slow module resolution on Windows.
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
    'The "natural" package is required for METEOR assertions. Install it alongside Promptfoo: npm install promptfoo natural@^8.1.1.',
    'METEOR requires natural@^8.1.1; found 7.1.0. Install it alongside Promptfoo: npm install promptfoo natural@^8.1.1.',
  ])('returns an actionable dependency failure: %s', async (message) => {
    mockHandleMeteorAssertion.mockRejectedValue(new Error(message));

    const result = await runAssertion(params);

    expect(result).toMatchObject({ pass: false, score: 0, reason: message });
    expect(result.assertion).toBe(params.assertion);
  });

  it.each(['Some other error', "Cannot find module 'natural-binding'"])(
    'preserves unexpected handler errors: %s',
    async (message) => {
      const error = Object.assign(new Error(message), { code: 'MODULE_NOT_FOUND' });
      mockHandleMeteorAssertion.mockRejectedValue(error);

      await expect(runAssertion(params)).rejects.toBe(error);
    },
  );
});
