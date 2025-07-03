import { handleContextFaithfulness } from '../../src/assertions/contextFaithfulness';
import * as contextUtils from '../../src/assertions/contextUtils';
import * as matchers from '../../src/matchers';

jest.mock('../../src/matchers');
jest.mock('../../src/assertions/contextUtils');

describe('handleContextFaithfulness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when context faithfulness is above threshold', async () => {
    const mockResult = { pass: true, score: 0.9, reason: 'Content is faithful to context' };
    jest.mocked(matchers.matchesContextFaithfulness).mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('test context');

    const result = await handleContextFaithfulness({
      assertion: {
        type: 'context-faithfulness',
        threshold: 0.7,
      },
      test: {
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France.',
        },
        options: {},
      },
      output: 'The capital of France is Paris.',
      prompt: 'test prompt',
      baseType: 'context-faithfulness',
      context: {
        prompt: 'test prompt',
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France.',
        },
        test: {
          vars: {
            query: 'What is the capital of France?',
            context: 'Paris is the capital of France.',
          },
          options: {},
        },
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'The capital of France is Paris.',
      providerResponse: null,
    } as any);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.reason).toBe('Content is faithful to context');
    expect(matchers.matchesContextFaithfulness).toHaveBeenCalledWith(
      'What is the capital of France?',
      'The capital of France is Paris.',
      'test context',
      0.7,
      {},
    );
  });

  it('should fail when context faithfulness is below threshold', async () => {
    const mockResult = { pass: false, score: 0.3, reason: 'Content contains hallucinations' };
    jest.mocked(matchers.matchesContextFaithfulness).mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('test context');

    const result = await handleContextFaithfulness({
      assertion: {
        type: 'context-faithfulness',
        threshold: 0.7,
      },
      test: {
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France.',
        },
        options: {},
      },
      output: 'The capital of France is Paris and it has a population of 50 million.',
      prompt: 'test prompt',
      baseType: 'context-faithfulness',
      context: {
        prompt: 'test prompt',
        vars: {
          query: 'What is the capital of France?',
          context: 'Paris is the capital of France.',
        },
        test: {
          vars: {
            query: 'What is the capital of France?',
            context: 'Paris is the capital of France.',
          },
          options: {},
        },
        logProbs: null,
        tokenUsage: null,
        cached: false,
        provider: null,
        providerResponse: null,
      },
      inverse: false,
      outputString: 'The capital of France is Paris and it has a population of 50 million.',
      providerResponse: null,
    } as any);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.3);
    expect(result.reason).toBe('Content contains hallucinations');
    expect(matchers.matchesContextFaithfulness).toHaveBeenCalledWith(
      'What is the capital of France?',
      'The capital of France is Paris and it has a population of 50 million.',
      'test context',
      0.7,
      {},
    );
  });

  it('should throw error when test.vars is undefined', async () => {
    await expect(
      handleContextFaithfulness({
        assertion: { type: 'context-faithfulness' },
        test: {
          vars: undefined,
          options: {},
        },
        output: 'test output',
        prompt: 'test prompt',
        baseType: 'context-faithfulness',
        context: {
          prompt: 'test prompt',
          vars: {},
          test: { vars: undefined, options: {} },
          logProbs: null,
          tokenUsage: null,
          cached: false,
          provider: null,
          providerResponse: null,
        },
        inverse: false,
        outputString: 'test output',
        providerResponse: null,
      } as any),
    ).rejects.toThrow('context-faithfulness assertion requires a test with variables');
  });

  it('should throw error when query is not a string', async () => {
    await expect(
      handleContextFaithfulness({
        assertion: { type: 'context-faithfulness' },
        test: {
          vars: {
            query: 123,
          },
          options: {},
        },
        output: 'test output',
        prompt: 'test prompt',
        baseType: 'context-faithfulness',
        context: {
          prompt: 'test prompt',
          vars: { query: 123 },
          test: { vars: { query: 123 }, options: {} },
          logProbs: null,
          tokenUsage: null,
          cached: false,
          provider: null,
          providerResponse: null,
        },
        inverse: false,
        outputString: 'test output',
        providerResponse: null,
      } as any),
    ).rejects.toThrow(
      'context-faithfulness assertion requires a "query" variable with the user question',
    );
  });

  it('should throw error when output is not a string', async () => {
    await expect(
      handleContextFaithfulness({
        assertion: { type: 'context-faithfulness' },
        test: {
          vars: {
            query: 'test query',
          },
          options: {},
        },
        output: 123,
        prompt: 'test prompt',
        baseType: 'context-faithfulness',
        context: {
          prompt: 'test prompt',
          vars: { query: 'test query' },
          test: { vars: { query: 'test query' }, options: {} },
          logProbs: null,
          tokenUsage: null,
          cached: false,
          provider: null,
          providerResponse: null,
        },
        inverse: false,
        outputString: '123',
        providerResponse: null,
      } as any),
    ).rejects.toThrow('context-faithfulness assertion requires string output from the provider');
  });

  it('should use contextTransform to extract context', async () => {
    const mockResult = { pass: true, score: 1, reason: 'ok' };
    jest.mocked(matchers.matchesContextFaithfulness).mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('from-transform');

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

    expect(contextUtils.resolveContext).toHaveBeenCalledWith(
      params.assertion,
      params.test,
      'raw',
      'prompt text',
      undefined,
      null,
    );
    expect(matchers.matchesContextFaithfulness).toHaveBeenCalledWith(
      'test query',
      'raw',
      'from-transform',
      0,
      {},
    );
  });
});
