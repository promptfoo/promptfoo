import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleContextRelevance } from '../../src/assertions/contextRelevance';
import * as contextUtils from '../../src/assertions/contextUtils';
import { matchesContextRelevance } from '../../src/matchers';

vi.mock('../../src/matchers');
vi.mock('../../src/assertions/contextUtils');

describe('handleContextRelevance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass when context relevance is above threshold', async () => {
    const mockResult = {
      pass: true,
      score: 0.9,
      reason: 'Context is highly relevant',
      metadata: {
        extractedSentences: ['Paris is the capital.'],
        totalContextSentences: 2,
        relevantSentenceCount: 1,
        insufficientInformation: false,
        score: 0.5,
      },
    };
    vi.mocked(matchesContextRelevance).mockResolvedValue(mockResult);
    vi.mocked(contextUtils.resolveContext).mockResolvedValue('test context');

    const result = await handleContextRelevance({
      assertion: {
        type: 'context-relevance',
        threshold: 0.8,
      },
      test: {
        vars: {
          query: 'What is the capital of France?',
          context: 'France is a country in Europe. Paris is the capital.',
        },
        options: {},
      },
      output: 'test output',
      prompt: 'test prompt',
      baseType: 'context-relevance',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {
          query: 'What is the capital of France?',
          context: 'France is a country in Europe. Paris is the capital.',
        },
        test: {
          vars: {
            query: 'What is the capital of France?',
            context: 'France is a country in Europe. Paris is the capital.',
          },
          options: {},
        },
        logProbs: undefined,
        provider: { id: () => 'id', config: {}, callApi: vi.fn() },
        providerResponse: { output: 'out', tokenUsage: {} },
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: { output: 'out', tokenUsage: {} },
    } as any);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.reason).toBe('Context is highly relevant');
    expect(result.metadata).toEqual({
      context: 'test context',
      extractedSentences: ['Paris is the capital.'],
      totalContextSentences: 2,
      relevantSentenceCount: 1,
      insufficientInformation: false,
      score: 0.5,
    });
    expect(matchesContextRelevance).toHaveBeenCalledWith(
      'What is the capital of France?',
      'test context',
      0.8,
      {},
      undefined,
    );
  });

  it('should fail when context relevance is below threshold', async () => {
    const mockResult = {
      pass: false,
      score: 0.3,
      reason: 'Context not relevant to query',
      metadata: {
        extractedSentences: [],
        totalContextSentences: 1,
        relevantSentenceCount: 0,
        insufficientInformation: true,
        score: 0,
      },
    };
    vi.mocked(matchesContextRelevance).mockResolvedValue(mockResult);
    vi.mocked(contextUtils.resolveContext).mockResolvedValue('irrelevant context');

    const result = await handleContextRelevance({
      assertion: {
        type: 'context-relevance',
        threshold: 0.7,
      },
      test: {
        vars: {
          query: 'What is the capital of France?',
          context: 'Information about weather patterns in Australia.',
        },
        options: {},
      },
      output: 'test output',
      prompt: 'test prompt',
      baseType: 'context-relevance',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {
          query: 'What is the capital of France?',
          context: 'Information about weather patterns in Australia.',
        },
        test: {
          vars: {
            query: 'What is the capital of France?',
            context: 'Information about weather patterns in Australia.',
          },
          options: {},
        },
        logProbs: undefined,
        provider: { id: () => 'id', config: {}, callApi: vi.fn() },
        providerResponse: { output: 'out', tokenUsage: {} },
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: { output: 'out', tokenUsage: {} },
    } as any);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.3);
    expect(result.reason).toBe('Context not relevant to query');
    expect(result.metadata).toEqual({
      context: 'irrelevant context',
      extractedSentences: [],
      totalContextSentences: 1,
      relevantSentenceCount: 0,
      insufficientInformation: true,
      score: 0,
    });
    expect(matchesContextRelevance).toHaveBeenCalledWith(
      'What is the capital of France?',
      'irrelevant context',
      0.7,
      {},
      undefined,
    );
  });

  it('should use default threshold of 0 when not provided', async () => {
    const mockResult = { pass: true, score: 1, reason: 'Perfect relevance' };
    vi.mocked(matchesContextRelevance).mockResolvedValue(mockResult);
    vi.mocked(contextUtils.resolveContext).mockResolvedValue('test context');

    const result = await handleContextRelevance({
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
      output: 'test output',
      prompt: 'test prompt',
      baseType: 'context-relevance',
      assertionValueContext: {
        prompt: 'test prompt',
        vars: { query: 'test query', context: 'test context' },
        test: { vars: { query: 'test query', context: 'test context' }, options: {} },
        logProbs: undefined,
        provider: { id: () => 'id', config: {}, callApi: vi.fn() },
        providerResponse: { output: 'out', tokenUsage: {} },
      },
      inverse: false,
      outputString: 'test output',
      providerResponse: { output: 'out', tokenUsage: {} },
    } as any);

    expect(matchesContextRelevance).toHaveBeenCalledWith(
      'test query',
      'test context',
      0,
      {},
      undefined,
    );
    expect(result.metadata).toEqual({
      context: 'test context',
    });
  });

  it('should throw error when test.vars is missing', async () => {
    await expect(
      handleContextRelevance({
        assertion: { type: 'context-relevance' },
        test: {
          vars: undefined,
          options: {},
        },
        output: 'test output',
        prompt: 'test prompt',
        baseType: 'context-relevance',
        assertionValueContext: {
          prompt: 'test prompt',
          vars: {},
          test: { vars: undefined, options: {} },
          logProbs: undefined,
          provider: { id: () => 'id', config: {}, callApi: vi.fn() },
          providerResponse: { output: 'out', tokenUsage: {} },
        },
        inverse: false,
        outputString: 'test output',
        providerResponse: { output: 'out', tokenUsage: {} },
      } as any),
    ).rejects.toThrow('context-relevance assertion requires a test with variables');
  });

  it('should throw error when query is missing', async () => {
    await expect(
      handleContextRelevance({
        assertion: { type: 'context-relevance' },
        test: {
          vars: {
            context: 'test context',
          },
          options: {},
        },
        output: 'test output',
        prompt: 'test prompt',
        baseType: 'context-relevance',
        assertionValueContext: {
          prompt: 'test prompt',
          vars: { context: 'test context' },
          test: { vars: { context: 'test context' }, options: {} },
          logProbs: undefined,
          provider: { id: () => 'id', config: {}, callApi: vi.fn() },
          providerResponse: { output: 'out', tokenUsage: {} },
        },
        inverse: false,
        outputString: 'test output',
        providerResponse: { output: 'out', tokenUsage: {} },
      } as any),
    ).rejects.toThrow(
      'context-relevance assertion requires a "query" variable with the user question',
    );
  });

  it('should use contextTransform when provided', async () => {
    const mockResult = { pass: true, score: 1, reason: 'ok' };
    vi.mocked(matchesContextRelevance).mockResolvedValue(mockResult);
    vi.mocked(contextUtils.resolveContext).mockResolvedValue('cx');

    const result = await handleContextRelevance({
      assertion: {
        type: 'context-relevance',
        contextTransform: 'expr',
      },
      test: {
        vars: { query: 'q' },
        options: {},
      },
      baseType: 'context-relevance',
      assertionValueContext: {
        prompt: 'p',
        vars: {},
        test: { vars: { query: 'q' }, options: {} },
        logProbs: undefined,
        provider: { id: () => 'id', config: {}, callApi: vi.fn() },
        providerResponse: { output: 'out', tokenUsage: {} },
      },
      inverse: false,
      prompt: 'p',
      output: 'out',
      outputString: 'out',
      providerResponse: { output: 'out', tokenUsage: {} },
    } as any);

    expect(contextUtils.resolveContext).toHaveBeenCalledWith(
      { type: 'context-relevance', contextTransform: 'expr' },
      { vars: { query: 'q' }, options: {} },
      'out',
      'p',
      undefined,
      { output: 'out', tokenUsage: {} },
    );
    expect(matchesContextRelevance).toHaveBeenCalledWith('q', 'cx', 0, {}, undefined);
    expect(result.metadata).toEqual({
      context: 'cx',
    });
  });
});
