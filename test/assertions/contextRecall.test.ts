import { handleContextRecall } from '../../src/assertions/contextRecall';
import * as contextUtils from '../../src/assertions/contextUtils';
import * as matchers from '../../src/matchers';

import type { ApiProvider, AssertionParams, ProviderResponse } from '../../src/types';

jest.mock('../../src/matchers');
jest.mock('../../src/assertions/contextUtils');

describe('handleContextRecall', () => {
  const mockMatchesContextRecall = jest.spyOn(matchers, 'matchesContextRecall');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should pass when context recall is above threshold', async () => {
    const mockResult = { pass: true, score: 0.9, reason: 'Context contains expected information' };
    mockMatchesContextRecall.mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('test context');

    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall', threshold: 0.8 },
      renderedValue: 'Expected fact',
      prompt: 'test prompt',
      test: { vars: { context: 'test context' }, options: {} },
      baseType: 'context-recall',
      context: {
        prompt: 'test prompt',
        vars: { context: 'test context' },
        test: { vars: { context: 'test context' }, options: {} },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    const result = await handleContextRecall(params);

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.9);
    expect(result.reason).toBe('Context contains expected information');
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.context).toBe('test context');
    expect(mockMatchesContextRecall).toHaveBeenCalledWith(
      'test context',
      'Expected fact',
      0.8,
      {},
      { context: 'test context' },
    );
  });

  it('should fail when context recall is below threshold', async () => {
    const mockResult = { pass: false, score: 0.3, reason: 'Context missing expected information' };
    mockMatchesContextRecall.mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('test context');

    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall', threshold: 0.7 },
      renderedValue: 'Missing fact',
      prompt: 'test prompt',
      test: { vars: { context: 'incomplete context' }, options: {} },
      baseType: 'context-recall',
      context: {
        prompt: 'test prompt',
        vars: { context: 'incomplete context' },
        test: { vars: { context: 'incomplete context' }, options: {} },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    const result = await handleContextRecall(params);

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0.3);
    expect(result.reason).toBe('Context missing expected information');
    expect(result.metadata).toBeDefined();
    expect(result.metadata?.context).toBe('test context');
    expect(mockMatchesContextRecall).toHaveBeenCalledWith(
      'test context',
      'Missing fact',
      0.7,
      {},
      { context: 'incomplete context' },
    );
  });

  it('should use default threshold of 0 when not provided', async () => {
    const mockResult = { pass: true, score: 1, reason: 'Perfect match' };
    mockMatchesContextRecall.mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('test context');

    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall' },
      renderedValue: 'test value',
      prompt: 'test prompt',
      test: { vars: { context: 'test context' }, options: {} },
      baseType: 'context-recall',
      context: {
        prompt: 'test prompt',
        vars: { context: 'test context' },
        test: { vars: { context: 'test context' }, options: {} },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    const result = await handleContextRecall(params);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.context).toBe('test context');
    expect(mockMatchesContextRecall).toHaveBeenCalledWith(
      'test context',
      'test value',
      0,
      {},
      { context: 'test context' },
    );
  });

  it('should fall back to prompt when no context variable', async () => {
    const mockResult = { pass: true, score: 1, reason: 'ok' };
    mockMatchesContextRecall.mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('test prompt');

    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall' },
      renderedValue: 'test output',
      prompt: 'test prompt',
      test: { vars: {}, options: {} },
      baseType: 'context-recall',
      context: {
        prompt: 'test prompt',
        vars: {},
        test: { vars: {}, options: {} },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    const result = await handleContextRecall(params);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.context).toBe('test prompt');
    expect(contextUtils.resolveContext).toHaveBeenCalledWith(
      params.assertion,
      params.test,
      params.output,
      'test prompt',
      'test prompt',
      {},
    );
    expect(mockMatchesContextRecall).toHaveBeenCalledWith('test prompt', 'test output', 0, {}, {});
  });

  it('should use contextTransform when provided', async () => {
    const mockResult = { pass: true, score: 1, reason: 'ok' };
    mockMatchesContextRecall.mockResolvedValue(mockResult);
    jest.mocked(contextUtils.resolveContext).mockResolvedValue('ctx');

    const mockProvider: ApiProvider = { id: () => 'p', callApi: jest.fn() };

    const params: AssertionParams = {
      assertion: { type: 'context-recall', contextTransform: 'expr' },
      renderedValue: 'val',
      prompt: 'prompt',
      test: { vars: {}, options: {} },
      baseType: 'context-recall',
      context: {
        prompt: 'prompt',
        vars: {},
        test: { vars: {}, options: {} },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: { context: 'hello' } as any,
      outputString: 'str',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    const result = await handleContextRecall(params);

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.context).toBe('ctx');
    expect(contextUtils.resolveContext).toHaveBeenCalledWith(
      params.assertion,
      params.test,
      params.output,
      'prompt',
      'prompt',
      {},
    );
    expect(mockMatchesContextRecall).toHaveBeenCalledWith('ctx', 'val', 0, {}, {});
  });

  it('should throw error when renderedValue is not a string', async () => {
    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall' },
      renderedValue: 123 as any,
      prompt: 'test prompt',
      test: { vars: { context: 'test context' }, options: {} },
      baseType: 'context-recall',
      context: {
        prompt: 'test prompt',
        vars: { context: 'test context' },
        test: { vars: { context: 'test context' }, options: {} },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    await expect(handleContextRecall(params)).rejects.toThrow(
      'context-recall assertion requires a string value (expected answer or fact to verify)',
    );
  });

  it('should throw error when prompt is missing', async () => {
    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall' },
      renderedValue: 'test value',
      prompt: undefined,
      test: { vars: { context: 'test context' }, options: {} },
      baseType: 'context-recall',
      context: {
        prompt: undefined,
        vars: { context: 'test context' },
        test: { vars: { context: 'test context' }, options: {} },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: 'test output',
      outputString: 'test output',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    await expect(handleContextRecall(params)).rejects.toThrow(
      'context-recall assertion requires a prompt',
    );
  });
});
