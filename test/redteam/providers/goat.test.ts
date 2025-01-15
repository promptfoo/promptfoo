import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import RedteamGoatProvider from '../../../src/redteam/providers/goat';
import { getRemoteGenerationUrl } from '../../../src/redteam/remoteGeneration';
import type {
  ApiProvider,
  AtomicTestCase,
  CallApiContextParams,
  ProviderResponse,
} from '../../../src/types';

// Silence all logging
jest.mock('../../../src/logger', () => ({
  debug: () => {},
  info: () => {},
  error: () => {},
  default: {
    debug: () => {},
    info: () => {},
    error: () => {},
  },
}));
jest.mock('../../../src/redteam/graders', () => ({
  getGraderById: () => ({
    getResult: async () => ({
      grade: {
        pass: false,
        tokensUsed: { total: 5, prompt: 2, completion: 3 },
      },
    }),
  }),
}));

// Mock sleep function
const mockSleep = jest.fn();
jest.mock('../../../src/util/time', () => ({
  sleep: (...args: unknown[]) => mockSleep(...args),
}));

const originalFetch = global.fetch;

describe('RedteamGoatProvider', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  const createMockTargetProvider = (output: any = 'target response', overrides: Partial<ApiProvider> = {}): ApiProvider => ({
    id: () => 'test-provider',
    callApi: async () =>
      Promise.resolve({
        output,
        tokenUsage: { total: 10, prompt: 5, completion: 5 },
      }) as ProviderResponse,
    ...overrides,
  });

  const createTestContext = (overrides: Partial<CallApiContextParams> = {}): CallApiContextParams => ({
    originalProvider: createMockTargetProvider(),
    vars: { goal: 'test goal' },
    prompt: { raw: 'test prompt', label: 'test' },
    ...overrides,
  });

  it('should initialize with required config', () => {
    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 3,
    });

    expect(provider.id()).toBe('promptfoo:redteam:goat');
  });

  it('should throw error if injectVar is missing', () => {
    expect(() => {
      new RedteamGoatProvider({});
    }).toThrow('Expected injectVar to be set');
  });

  it('should make correct API calls with message history', async () => {
    mockFetch.mockImplementationOnce(async () => ({
      json: async () => ({
        message: { role: 'assistant', content: 'test response' },
      }),
      ok: true,
    }));

    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 2,
    });

    const result = await provider.callApi('test prompt', createTestContext());
    expect(result.metadata?.stopReason).toBe('Max turns reached');

    expect(mockFetch).toHaveBeenCalledWith(
      getRemoteGenerationUrl(),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: expect.any(String),
      }),
    );

    // Type assertion for mock call
    type MockCallBody = { body: string };
    const mockCall = mockFetch.mock.calls[0][1] as MockCallBody;
    const requestBody = JSON.parse(mockCall.body) as {
      goal: string;
      i: number;
      messages: unknown[];
    };
    expect(requestBody).toMatchObject({
      goal: 'test goal',
      i: 0,
      messages: expect.any(Array),
    });
  });

  it('should handle grader integration and stop early on failure', async () => {
    mockFetch.mockImplementationOnce(async () => ({
      json: async () => ({
        message: { role: 'assistant', content: 'test response' },
        tokenUsage: { total: 5, prompt: 2, completion: 3 },
      }),
      ok: true,
    }));

    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 3,
    });

    const context = createTestContext({
      test: {
        vars: {},
        assert: [
          {
            type: 'contains',
            value: 'expected content',
          },
        ],
      } as AtomicTestCase,
    });

    const result = await provider.callApi('test prompt', context);
    expect(result.metadata?.stopReason).toBe('Grader failed');
    expect(result.tokenUsage?.total).toBeGreaterThan(0);
    expect(result.tokenUsage?.prompt).toBeGreaterThan(0);
    expect(result.tokenUsage?.completion).toBeGreaterThan(0);
  });

  it('should stringify non-string target provider responses', async () => {
    mockFetch.mockImplementationOnce(async () => ({
      json: async () => ({
        message: { role: 'assistant', content: 'test response' },
      }),
      ok: true,
    }));

    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const objectResponse = { foo: 'bar', baz: 123 };
    const context = createTestContext({
      originalProvider: createMockTargetProvider(objectResponse),
    });

    const result = await provider.callApi('test prompt', context);
    const messages = JSON.parse(result.metadata?.messages || '[]');
    expect(messages[messages.length - 1].content).toBe(JSON.stringify(objectResponse));
  });

  it('should handle network failures gracefully', async () => {
    mockFetch.mockImplementationOnce(async () => {
      throw new Error('Network error');
    });

    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const result = await provider.callApi('test prompt', createTestContext());
    expect(result.output).toBeUndefined();
    expect(result.metadata?.messages).toBe('[]');
  });

  it('should handle malformed API responses', async () => {
    mockFetch.mockImplementationOnce(async () => ({
      json: async () => ({
        message: { invalid: 'response' },
      }),
      ok: true,
    }));

    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const result = await provider.callApi('test prompt', createTestContext());
    expect(result.output).toBeUndefined();
    const messages = JSON.parse(result.metadata?.messages || '[]');
    expect(messages).toHaveLength(0);
  });

  it('should handle stateless mode correctly', async () => {
    mockFetch.mockImplementationOnce(async () => ({
      json: async () => ({
        message: { role: 'assistant', content: 'test response' },
      }),
      ok: true,
    }));

    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
      stateless: false,
    });

    await provider.callApi('test prompt', createTestContext());
    
    // In non-stateless mode, only the last message content should be used
    const mockCall = mockFetch.mock.calls[0][1] as { body: string };
    const requestBody = JSON.parse(mockCall.body) as { messages: unknown[] };
    expect(requestBody.messages).toHaveLength(0);
  });

  it('should handle undefined token usage from target provider', async () => {
    mockFetch.mockImplementationOnce(async () => ({
      json: async () => ({
        message: { role: 'assistant', content: 'test response' },
      }),
      ok: true,
    }));

    const provider = new RedteamGoatProvider({
      injectVar: 'goal',
      maxTurns: 1,
    });

    const context = createTestContext({
      originalProvider: createMockTargetProvider('response', {
        callApi: async () =>
          Promise.resolve({
            output: 'response',
            // No tokenUsage field
          }) as ProviderResponse,
      }),
    });

    const result = await provider.callApi('test prompt', context);
    expect(result.tokenUsage?.numRequests).toBe(1);
  });
});
