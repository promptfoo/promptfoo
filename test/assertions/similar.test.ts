import { handleSimilar } from '../../src/assertions/similar';
import { matchesSimilarity } from '../../src/matchers';

// Mock matchesSimilarity
jest.mock('../../src/matchers', () => ({
  matchesSimilarity: jest.fn(),
}));

describe('handleSimilar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle string similarity check', async () => {
    jest.mocked(matchesSimilarity).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Similarity check passed',
    });

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: 'hello world',
        threshold: 0.8,
      },
      renderedValue: 'hello world',
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'similar' as any,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
        providerResponse: { output: 'test output' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(matchesSimilarity).toHaveBeenCalledWith('hello world', 'hello world', 0.8, false, {});
  });

  it('should handle array of strings similarity check', async () => {
    jest.mocked(matchesSimilarity).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Similarity check passed',
    });

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: ['hello world', 'hi there'],
        threshold: 0.8,
      },
      renderedValue: ['hello world', 'hi there'],
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'similar' as any,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
        providerResponse: { output: 'test output' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('should fail when no array values meet threshold', async () => {
    jest.mocked(matchesSimilarity).mockResolvedValue({
      pass: false,
      score: 0.3,
      reason: 'Below similarity threshold',
    });

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: ['foo', 'bar'],
        threshold: 0.8,
      },
      renderedValue: ['foo', 'bar'],
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'similar' as any,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
        providerResponse: { output: 'test output' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('None of the provided values met the similarity threshold');
    expect(result.score).toBe(0.3);
  });

  it('should use default threshold when not specified', async () => {
    jest.mocked(matchesSimilarity).mockResolvedValue({
      pass: true,
      score: 1,
      reason: 'Similarity check passed',
    });

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: 'hello world',
      },
      renderedValue: 'hello world',
      outputString: 'hello world',
      inverse: false,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'similar' as any,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
        providerResponse: { output: 'test output' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(matchesSimilarity).toHaveBeenCalledWith('hello world', 'hello world', 0.75, false, {});
  });

  it('should handle inverse similarity check', async () => {
    jest.mocked(matchesSimilarity).mockResolvedValue({
      pass: true,
      score: 0.2,
      reason: 'Inverse similarity check passed',
    });

    const result = await handleSimilar({
      assertion: {
        type: 'similar',
        value: 'foo bar',
        threshold: 0.8,
      },
      renderedValue: 'foo bar',
      outputString: 'hello world',
      inverse: true,
      test: {
        description: 'test',
        vars: {},
        assert: [],
        options: {},
      },
      baseType: 'similar' as any,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          callApi: async () => ({ output: 'test' }),
        },
        providerResponse: { output: 'test output' },
      },
      output: 'hello world',
      providerResponse: { output: 'hello world' },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.2);
  });

  it('should throw error for invalid value type', async () => {
    await expect(
      handleSimilar({
        assertion: {
          type: 'similar',
          value: 'test',
          threshold: 0.8,
        },
        renderedValue: {} as any,
        outputString: 'hello world',
        inverse: false,
        test: {
          description: 'test',
          vars: {},
          assert: [],
          options: {},
        },
        baseType: 'similar' as any,
        context: {
          prompt: 'test prompt',
          vars: {},
          test: {
            description: 'test',
            vars: {},
            assert: [],
            options: {},
          },
          logProbs: undefined,
          provider: {
            id: () => 'test-provider',
            callApi: async () => ({ output: 'test' }),
          },
          providerResponse: { output: 'test output' },
        },
        output: 'hello world',
        providerResponse: { output: 'hello world' },
      }),
    ).rejects.toThrow('Similarity assertion type must have a string or array of strings value');
  });
});
