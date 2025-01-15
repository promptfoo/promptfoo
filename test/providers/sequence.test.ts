import type nunjucks from 'nunjucks';
import { SequenceProvider } from '../../src/providers/sequence';
import type { CallApiContextParams, Prompt } from '../../src/types';
import { getNunjucksEngine } from '../../src/util/templates';

jest.mock('../../src/util/templates');

describe('SequenceProvider', () => {
  let mockOriginalProvider: any;
  let mockNunjucksEnv: nunjucks.Environment;

  beforeEach(() => {
    mockOriginalProvider = {
      callApi: jest.fn(),
    };

    mockNunjucksEnv = {
      renderString: jest.fn((str) => str),
      options: {},
      render: jest.fn(),
      addFilter: jest.fn(),
      getFilter: jest.fn(),
      hasExtension: jest.fn(),
      addExtension: jest.fn(),
      removeExtension: jest.fn(),
      getExtension: jest.fn(),
      addGlobal: jest.fn(),
      getGlobal: jest.fn(),
      addTemplate: jest.fn(),
      express: jest.fn(),
      getTemplate: jest.fn(),
    } as unknown as nunjucks.Environment;

    jest.mocked(getNunjucksEngine).mockReturnValue(mockNunjucksEnv);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with required config', () => {
    const provider = new SequenceProvider({
      id: 'test-sequence',
      config: {
        inputs: ['input1', 'input2'],
      },
    });

    expect(provider.id()).toBe('test-sequence');
  });

  it('should throw error if config is missing inputs', () => {
    expect(() => {
      new SequenceProvider({
        id: 'test',
        config: {} as any,
      });
    }).toThrow('Expected sequence provider config to contain an array of inputs');
  });

  it('should call original provider for each input and join responses', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1', 'input2'],
        separator: '|',
      },
    });

    mockOriginalProvider.callApi
      .mockResolvedValueOnce({ output: 'response1' })
      .mockResolvedValueOnce({ output: 'response2' });

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: { var1: 'value1' },
      prompt: { raw: 'test prompt' } as Prompt,
    };

    const result = await provider.callApi('test prompt', context);

    expect(mockOriginalProvider.callApi).toHaveBeenCalledTimes(2);
    expect(result.output).toBe('response1|response2');
  });

  it('should accumulate token usage from responses', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1', 'input2'],
      },
    });

    mockOriginalProvider.callApi
      .mockResolvedValueOnce({
        output: 'response1',
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          numRequests: 1,
          cached: 0,
        },
      })
      .mockResolvedValueOnce({
        output: 'response2',
        tokenUsage: {
          total: 20,
          prompt: 10,
          completion: 10,
          numRequests: 1,
          cached: 1,
        },
      });

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: {},
      prompt: { raw: 'test' } as Prompt,
    };

    const result = await provider.callApi('test', context);

    expect(result.tokenUsage).toEqual({
      total: 30,
      prompt: 15,
      completion: 15,
      numRequests: 2,
      cached: 1,
    });
  });

  it('should return error response if original provider fails', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1', 'input2'],
      },
    });

    const errorResponse = { error: 'Provider error', output: '' };
    mockOriginalProvider.callApi.mockResolvedValueOnce(errorResponse);

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: {},
      prompt: { raw: 'test' } as Prompt,
    };

    const result = await provider.callApi('test', context);

    expect(result).toEqual(errorResponse);
    expect(mockOriginalProvider.callApi).toHaveBeenCalledTimes(1);
  });

  it('should use default separator if none provided', async () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1', 'input2'],
      },
    });

    mockOriginalProvider.callApi
      .mockResolvedValueOnce({ output: 'response1' })
      .mockResolvedValueOnce({ output: 'response2' });

    const context: CallApiContextParams = {
      originalProvider: mockOriginalProvider,
      vars: {},
      prompt: { raw: 'test' } as Prompt,
    };

    const result = await provider.callApi('test', context);

    expect(result.output).toBe('response1\n---\nresponse2');
  });

  it('should return string representation', () => {
    const provider = new SequenceProvider({
      id: 'test',
      config: {
        inputs: ['input1'],
      },
    });

    expect(provider.toString()).toBe('[Sequence Provider]');
  });
});
