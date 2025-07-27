// Special test for METEOR assertion integration
describe('METEOR assertion', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('should use the handleMeteorAssertion when natural is available', async () => {
    // Setup a mock for the meteor module
    jest.mock('../../src/assertions/meteor', () => ({
      handleMeteorAssertion: jest.fn().mockResolvedValue({
        pass: true,
        score: 0.85,
        reason: 'METEOR test passed',
        assertion: { type: 'meteor' },
      }),
    }));

    // Import after mocking
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
    const { handleMeteorAssertion } = await import('../../src/assertions/meteor');
    expect(handleMeteorAssertion).toHaveBeenCalledWith(expect.anything());
    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.85);
    expect(result.reason).toBe('METEOR test passed');
  });

  it('should handle errors when natural package is missing', async () => {
    // Mock dynamic import to simulate the module not being found
    jest.mock('../../src/assertions/meteor', () => {
      throw new Error("Cannot find module 'natural'");
    });

    // Import after mocking
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

    // Verify the error is handled correctly
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe(
      'METEOR assertion requires the natural package. Please install it using: npm install natural',
    );
    expect(result.assertion).toEqual({
      type: 'meteor',
      value: 'Expected output',
      threshold: 0.7,
    });
  });

  it('should rethrow other errors that are not related to missing module', async () => {
    // Mock dynamic import to simulate some other error
    jest.mock('../../src/assertions/meteor', () => {
      throw new Error('Some other error');
    });

    // Import after mocking
    const { runAssertion } = await import('../../src/assertions');

    // The error should be rethrown
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
