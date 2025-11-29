import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Special test for METEOR assertion integration
describe('METEOR assertion', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use the handleMeteorAssertion when natural is available', async () => {
    const mockHandleMeteorAssertion = vi.fn().mockResolvedValue({
      pass: true,
      score: 0.85,
      reason: 'METEOR test passed',
      assertion: { type: 'meteor' },
    });

    // Setup mock before import
    vi.doMock('../../src/assertions/meteor', () => ({
      handleMeteorAssertion: mockHandleMeteorAssertion,
    }));

    // Import the module
    const { runAssertion } = await import('../../src/assertions');

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

  it('should handle errors when natural package is missing', async () => {
    // Mock handleMeteorAssertion to throw when called (simulates missing 'natural' module)
    const mockHandleMeteorAssertion = vi.fn().mockImplementation(() => {
      throw new Error("Cannot find module 'natural'");
    });

    vi.doMock('../../src/assertions/meteor', () => ({
      handleMeteorAssertion: mockHandleMeteorAssertion,
    }));

    const { runAssertion } = await import('../../src/assertions');

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
      'METEOR assertion requires the natural package. Please install it using: npm install natural@^8.1.0',
    );
    expect(result.assertion).toEqual({
      type: 'meteor',
      value: 'Expected output',
      threshold: 0.7,
    });
  });

  it('should rethrow other errors that are not related to missing module', async () => {
    // Mock handleMeteorAssertion to throw a non-module-related error
    const mockHandleMeteorAssertion = vi.fn().mockImplementation(() => {
      throw new Error('Some other error');
    });

    vi.doMock('../../src/assertions/meteor', () => ({
      handleMeteorAssertion: mockHandleMeteorAssertion,
    }));

    const { runAssertion } = await import('../../src/assertions');

    // The error should be rethrown since it's not a "Cannot find module" error
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
    ).rejects.toThrow('Some other error');
  });
});
