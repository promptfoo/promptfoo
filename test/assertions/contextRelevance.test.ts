import { handleContextRelevance } from '../../src/assertions/contextRelevance';
import { matchesContextRelevance } from '../../src/matchers';

jest.mock('../../src/matchers');

describe('handleContextRelevance', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should handle valid input', async () => {
    const mockResult = {
      pass: true,
      score: 0.8,
      reason: 'test reason',
    };

    jest.mocked(matchesContextRelevance).mockResolvedValue(mockResult);

    const result = await handleContextRelevance({
      assertion: {
        type: 'context-relevance',
        threshold: 0.7,
      },
      test: {
        vars: {
          query: 'test query',
          context: 'test context',
        },
        options: {},
      },
      baseType: 'context-relevance',
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {
          vars: {
            query: 'test query',
            context: 'test context',
          },
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          config: {},
          callApi: jest.fn(),
        },
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
    } as any);

    expect(result).toEqual({
      assertion: {
        type: 'context-relevance',
        threshold: 0.7,
      },
      ...mockResult,
    });

    expect(matchesContextRelevance).toHaveBeenCalledWith('test query', 'test context', 0.7, {});
  });

  it('should throw error if vars is missing', async () => {
    await expect(
      handleContextRelevance({
        assertion: {
          type: 'context-relevance',
        },
        test: {},
        baseType: 'context-relevance',
        context: {
          prompt: 'test prompt',
          vars: {},
          test: {
            vars: {
              query: 'test query',
              context: 'test context',
            },
            options: {},
          },
          logProbs: undefined,
          provider: {
            id: () => 'test-provider',
            config: {},
            callApi: jest.fn(),
          },
          providerResponse: {
            output: 'test output',
            tokenUsage: {},
          },
        },
        inverse: false,
        output: 'test output',
        outputString: 'test output',
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      } as any),
    ).rejects.toThrow('context-relevance assertion type must have a vars object');
  });

  it('should throw error if query is missing', async () => {
    await expect(
      handleContextRelevance({
        assertion: {
          type: 'context-relevance',
        },
        test: {
          vars: {
            context: 'test context',
          },
        },
        baseType: 'context-relevance',
        context: {
          prompt: 'test prompt',
          vars: {},
          test: {
            vars: {
              query: 'test query',
              context: 'test context',
            },
            options: {},
          },
          logProbs: undefined,
          provider: {
            id: () => 'test-provider',
            config: {},
            callApi: jest.fn(),
          },
          providerResponse: {
            output: 'test output',
            tokenUsage: {},
          },
        },
        inverse: false,
        output: 'test output',
        outputString: 'test output',
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      } as any),
    ).rejects.toThrow('context-relevance assertion type must have a query var');
  });

  it('should throw error if context is missing', async () => {
    await expect(
      handleContextRelevance({
        assertion: {
          type: 'context-relevance',
        },
        test: {
          vars: {
            query: 'test query',
          },
        },
        baseType: 'context-relevance',
        context: {
          prompt: 'test prompt',
          vars: {},
          test: {
            vars: {
              query: 'test query',
              context: 'test context',
            },
            options: {},
          },
          logProbs: undefined,
          provider: {
            id: () => 'test-provider',
            config: {},
            callApi: jest.fn(),
          },
          providerResponse: {
            output: 'test output',
            tokenUsage: {},
          },
        },
        inverse: false,
        output: 'test output',
        outputString: 'test output',
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      } as any),
    ).rejects.toThrow('context-relevance assertion type must have a context var');
  });

  it('should use default threshold of 0 if not specified', async () => {
    const mockResult = {
      pass: true,
      score: 0.5,
      reason: 'test reason',
    };

    jest.mocked(matchesContextRelevance).mockResolvedValue(mockResult);

    await handleContextRelevance({
      assertion: {
        type: 'context-relevance',
      },
      test: {
        vars: {
          query: 'test query',
          context: 'test context',
        },
        options: {},
      },
      baseType: 'context-relevance',
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {
          vars: {
            query: 'test query',
            context: 'test context',
          },
          options: {},
        },
        logProbs: undefined,
        provider: {
          id: () => 'test-provider',
          config: {},
          callApi: jest.fn(),
        },
        providerResponse: {
          output: 'test output',
          tokenUsage: {},
        },
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      providerResponse: {
        output: 'test output',
        tokenUsage: {},
      },
    } as any);

    expect(matchesContextRelevance).toHaveBeenCalledWith('test query', 'test context', 0, {});
  });
});
