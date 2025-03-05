import { handleContextRecall } from '../../src/assertions/contextRecall';
import * as matchers from '../../src/matchers';
import type { AssertionParams, ApiProvider, ProviderResponse } from '../../src/types';

jest.mock('../../src/matchers');

describe('handleContextRecall', () => {
  const mockMatchesContextRecall = jest.spyOn(matchers, 'matchesContextRecall');

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should handle context recall with prompt context', async () => {
    const mockResult = {
      pass: true,
      score: 0.9,
      reason: 'Good recall',
    };
    mockMatchesContextRecall.mockResolvedValue(mockResult);

    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall', threshold: 0.8 },
      renderedValue: 'test output',
      prompt: 'test context',
      test: {
        vars: {},
        options: {},
      },
      baseType: 'context-recall',
      context: {
        prompt: 'test context',
        vars: {},
        test: {
          vars: {},
          options: {},
        },
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

    expect(result).toEqual({
      assertion: { type: 'context-recall', threshold: 0.8 },
      ...mockResult,
    });
    expect(mockMatchesContextRecall).toHaveBeenCalledWith(
      'test context',
      'test output',
      0.8,
      {},
      {},
    );
  });

  it('should handle context recall with vars context', async () => {
    const mockResult = {
      pass: true,
      score: 0.85,
      reason: 'Good recall from vars',
    };
    mockMatchesContextRecall.mockResolvedValue(mockResult);

    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall', threshold: 0.7 },
      renderedValue: 'test output',
      prompt: 'original context',
      test: {
        vars: { context: 'context from vars' },
        options: {},
      },
      baseType: 'context-recall',
      context: {
        prompt: 'original context',
        vars: { context: 'context from vars' },
        test: {
          vars: { context: 'context from vars' },
          options: {},
        },
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

    expect(result).toEqual({
      assertion: { type: 'context-recall', threshold: 0.7 },
      ...mockResult,
    });
    expect(mockMatchesContextRecall).toHaveBeenCalledWith(
      'context from vars',
      'test output',
      0.7,
      {},
      { context: 'context from vars' },
    );
  });

  it('should use default threshold of 0 when not provided', async () => {
    const mockResult = {
      pass: true,
      score: 0.5,
      reason: 'Default threshold test',
    };
    mockMatchesContextRecall.mockResolvedValue(mockResult);

    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall' },
      renderedValue: 'test output',
      prompt: 'test context',
      test: {
        vars: {},
        options: {},
      },
      baseType: 'context-recall',
      context: {
        prompt: 'test context',
        vars: {},
        test: {
          vars: {},
          options: {},
        },
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

    expect(result).toEqual({
      assertion: { type: 'context-recall' },
      ...mockResult,
    });
    expect(mockMatchesContextRecall).toHaveBeenCalledWith('test context', 'test output', 0, {}, {});
  });

  it('should throw error when renderedValue is not a string', async () => {
    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall' },
      renderedValue: { value: 123 }, // Changed to object to match AssertionValue type
      prompt: 'test context',
      test: {
        vars: {},
        options: {},
      },
      baseType: 'context-recall',
      context: {
        prompt: 'test context',
        vars: {},
        test: {
          vars: {},
          options: {},
        },
        logProbs: undefined,
        provider: mockProvider,
        providerResponse: undefined,
      },
      inverse: false,
      output: '123',
      outputString: '123',
      provider: mockProvider,
      providerResponse: {} as ProviderResponse,
    };

    await expect(handleContextRecall(params)).rejects.toThrow(
      'context-recall assertion type must have a string value',
    );
  });

  it('should throw error when prompt is missing', async () => {
    const mockProvider: ApiProvider = {
      id: () => 'test-provider',
      callApi: jest.fn(),
    };

    const params: AssertionParams = {
      assertion: { type: 'context-recall' },
      renderedValue: 'test output',
      prompt: undefined,
      test: {
        vars: {},
        options: {},
      },
      baseType: 'context-recall',
      context: {
        prompt: undefined,
        vars: {},
        test: {
          vars: {},
          options: {},
        },
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
      'context-recall assertion type must have a prompt',
    );
  });
});
