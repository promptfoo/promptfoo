import logger from '../../src/logger';
import { SequenceProvider } from '../../src/providers/sequence';
import type { ApiProvider, CallApiContextParams, ProviderResponse, Prompt } from '../../src/types';

jest.mock('../../src/logger');

describe('SequenceProvider', () => {
  let mockOriginalProvider: ApiProvider;
  let mockLogger: typeof logger;
  let testPrompt: Prompt;

  beforeEach(() => {
    mockOriginalProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    (logger as any).debug = mockLogger.debug;

    testPrompt = {
      raw: 'test prompt',
      display: 'test prompt',
      label: 'test-prompt',
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with required config', () => {
    const provider = new SequenceProvider({
      id: 'test-sequence',
      config: {
        inputs: ['input1', 'input2'],
      },
    });

    expect(provider.id()).toBe('test-sequence');
    expect(provider.toString()).toBe('[Sequence Provider]');
  });

  it('should throw error when inputs array is missing', () => {
    expect(() => {
      new SequenceProvider({
        id: 'test',
        config: {} as any,
      });
    }).toThrow('Expected sequence provider config to contain an array of inputs');
  });

  it('should call original provider for each input and combine responses', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1', 'input2'],
        separator: '|',
      },
    });

    jest.mocked(mockOriginalProvider.callApi).mockResolvedValueOnce({
      output: 'response1',
      tokenUsage: { total: 10, prompt: 5, completion: 5, numRequests: 1 },
    });

    jest.mocked(mockOriginalProvider.callApi).mockResolvedValueOnce({
      output: 'response2',
      tokenUsage: { total: 20, prompt: 10, completion: 10, numRequests: 1 },
    });

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: { var1: 'value1' },
      prompt: testPrompt,
    };

    const result = await provider.callApi('test prompt', context);

    expect(result).toEqual({
      output: 'response1|response2',
      tokenUsage: {
        total: 30,
        prompt: 15,
        completion: 15,
        numRequests: 2,
        cached: 0,
      },
    });
  });

  it('should handle errors from original provider', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1', 'input2'],
      },
    });

    const errorResponse: ProviderResponse = {
      error: 'API Error',
      output: '',
    };

    jest.mocked(mockOriginalProvider.callApi).mockResolvedValueOnce(errorResponse);

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: {},
      prompt: testPrompt,
    };

    const result = await provider.callApi('test prompt', context);

    expect(result).toEqual(errorResponse);
  });

  it('should handle missing token usage', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1'],
      },
    });

    jest.mocked(mockOriginalProvider.callApi).mockResolvedValueOnce({
      output: 'response1',
    });

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: {},
      prompt: testPrompt,
    };

    const result = await provider.callApi('test prompt', context);

    expect(result.tokenUsage).toEqual({
      total: 0,
      prompt: 0,
      completion: 0,
      numRequests: 1,
      cached: 0,
    });
  });

  it('should use default separator when not specified', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1', 'input2'],
      },
    });

    jest.mocked(mockOriginalProvider.callApi).mockResolvedValueOnce({
      output: 'response1',
    });
    jest.mocked(mockOriginalProvider.callApi).mockResolvedValueOnce({
      output: 'response2',
    });

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: {},
      prompt: testPrompt,
    };

    const result = await provider.callApi('test prompt', context);

    expect(result.output).toBe('response1\n---\nresponse2');
  });

  it('should throw error when originalProvider is not set', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1'],
      },
    });

    await expect(provider.callApi('test prompt', { vars: {}, prompt: testPrompt })).rejects.toThrow(
      'Expected originalProvider to be set',
    );
  });
});
