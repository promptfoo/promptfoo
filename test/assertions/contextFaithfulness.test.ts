import { handleContextFaithfulness } from '../../src/assertions/contextFaithfulness';
import * as matchers from '../../src/matchers';
import * as transformUtil from '../../src/util/transform';

jest.mock('../../src/matchers');
jest.mock('../../src/util/transform');

describe('handleContextFaithfulness', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should throw error if vars is missing', async () => {
    const params = {
      assertion: { type: 'context-faithfulness' },
      test: {},
      output: 'test output',
      baseType: 'context-faithfulness' as const,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {},
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: null,
    };

    await expect(handleContextFaithfulness(params as any)).rejects.toThrow(
      'context-faithfulness assertion type must have a vars object',
    );
  });

  it('should throw error if query is missing', async () => {
    const params = {
      assertion: { type: 'context-faithfulness' },
      test: {
        vars: {
          context: 'test context',
        },
      },
      output: 'test output',
      baseType: 'context-faithfulness' as const,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {},
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: null,
    };

    await expect(handleContextFaithfulness(params as any)).rejects.toThrow(
      'context-faithfulness assertion type must have a query var',
    );
  });

  it('should throw error if context is missing', async () => {
    const params = {
      assertion: { type: 'context-faithfulness' },
      test: {
        vars: {
          query: 'test query',
        },
      },
      output: 'test output',
      baseType: 'context-faithfulness' as const,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {},
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: null,
    };

    await expect(handleContextFaithfulness(params as any)).rejects.toThrow(
      'context-faithfulness assertion type must have a context var',
    );
  });

  it('should throw error if output is not a string', async () => {
    const params = {
      assertion: { type: 'context-faithfulness' },
      test: {
        vars: {
          query: 'test query',
          context: 'test context',
        },
      },
      output: 123,
      baseType: 'context-faithfulness' as const,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {},
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: null,
    };

    await expect(handleContextFaithfulness(params as any)).rejects.toThrow(
      'context-faithfulness assertion type must have a string output',
    );
  });

  it('should call matchesContextFaithfulness with correct params', async () => {
    const mockResult = {
      pass: true,
      score: 0.9,
      reason: 'test reason',
    };

    jest.mocked(matchers.matchesContextFaithfulness).mockResolvedValue(mockResult);

    const params = {
      assertion: {
        type: 'context-faithfulness' as const,
        threshold: 0.8,
      },
      test: {
        vars: {
          query: 'test query',
          context: 'test context',
        },
        options: {
          provider: 'test-provider',
        },
      },
      output: 'test output',
      baseType: 'context-faithfulness' as const,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {},
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: null,
    };

    const result = await handleContextFaithfulness(params as any);

    expect(matchers.matchesContextFaithfulness).toHaveBeenCalledWith(
      'test query',
      'test output',
      'test context',
      0.8,
      { provider: 'test-provider' },
    );

    expect(result).toEqual({
      assertion: params.assertion,
      ...mockResult,
    });
  });

  it('should use default threshold of 0 if not provided', async () => {
    const mockResult = {
      pass: true,
      score: 0.9,
      reason: 'test reason',
    };

    jest.mocked(matchers.matchesContextFaithfulness).mockResolvedValue(mockResult);

    const params = {
      assertion: {
        type: 'context-faithfulness' as const,
      },
      test: {
        vars: {
          query: 'test query',
          context: 'test context',
        },
        options: {},
      },
      output: 'test output',
      baseType: 'context-faithfulness' as const,
      context: {
        prompt: 'test prompt',
        vars: {},
        test: {},
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: null,
    };

    await handleContextFaithfulness(params as any);

    expect(matchers.matchesContextFaithfulness).toHaveBeenCalledWith(
      'test query',
      'test output',
      'test context',
      0,
      {},
    );
  });

  it('should use contextTransform to extract context', async () => {
    const mockResult = { pass: true, score: 1, reason: 'ok' };
    jest.mocked(matchers.matchesContextFaithfulness).mockResolvedValue(mockResult);
    jest.mocked(transformUtil.transform).mockResolvedValue('from-transform');

    const params = {
      assertion: {
        type: 'context-faithfulness' as const,
        contextTransform: 'output.context',
      },
      test: {
        vars: {
          query: 'test query',
        },
        options: {},
      },
      output: 'raw',
      prompt: 'prompt text',
      baseType: 'context-faithfulness' as const,
      context: {
        prompt: 'prompt text',
        vars: {},
        test: {},
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'raw',
      providerResponse: null,
    } as any;

    await handleContextFaithfulness(params);

    expect(transformUtil.transform).toHaveBeenCalledWith('output.context', 'raw', {
      vars: params.test.vars,
      prompt: { label: 'prompt text' },
    });
    expect(matchers.matchesContextFaithfulness).toHaveBeenCalledWith(
      'test query',
      'raw',
      'from-transform',
      0,
      {},
    );
  });
});
