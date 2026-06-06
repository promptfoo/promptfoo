import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArgsSchema,
  doTargetPurposeDiscovery,
  normalizeTargetPurposeDiscoveryResult,
} from '../../../src/redteam/commands/discover';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import { createMockProvider } from '../../factories/provider';

const { mockProgressBar, mockSingleBar } = vi.hoisted(() => ({
  mockProgressBar: {
    increment: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
  mockSingleBar: vi.fn(),
}));

vi.mock('cli-progress', () => ({
  default: {
    SingleBar: mockSingleBar,
  },
}));
vi.mock('../../../src/util/fetch/index');

const mockedFetchWithProxy = vi.mocked(fetchWithProxy);

describe('ArgsSchema', () => {
  it('`config` and `target` are mutually exclusive', () => {
    const args = {
      config: 'test',
      target: 'test',
      preview: false,
      overwrite: false,
    };

    const { success, error } = ArgsSchema.safeParse(args);
    expect(success).toBe(false);
    expect(error?.issues[0].message).toBe('Cannot specify both config and target!');
  });
});

describe('normalizeTargetPurposeDiscoveryResult', () => {
  it('should handle null-like values', () => {
    const result = normalizeTargetPurposeDiscoveryResult({
      purpose: null,
      limitations: '',
      user: 'null',
      tools: [],
    });

    expect(result).toEqual({
      purpose: null,
      limitations: null,
      user: null,
      tools: [],
    });
  });

  it('should handle string "null" values', () => {
    const result = normalizeTargetPurposeDiscoveryResult({
      purpose: 'null',
      limitations: 'null',
      user: 'null',
      tools: [],
    });

    expect(result).toEqual({
      purpose: null,
      limitations: null,
      user: null,
      tools: [],
    });
  });

  it('should handle invalid tools array', () => {
    const result = normalizeTargetPurposeDiscoveryResult({
      purpose: 'test',
      limitations: 'test',
      user: 'test',
      tools: null as any,
    });

    expect(result).toEqual({
      purpose: 'test',
      limitations: 'test',
      user: 'test',
      tools: [],
    });
  });

  it('should filter invalid tools from array', () => {
    const result = normalizeTargetPurposeDiscoveryResult({
      purpose: 'test',
      limitations: 'test',
      user: 'test',
      tools: [
        null,
        { name: 'tool1', description: 'desc1', arguments: [] },
        null,
        { name: 'tool2', description: 'desc2', arguments: [] },
      ],
    });

    expect(result).toEqual({
      purpose: 'test',
      limitations: 'test',
      user: 'test',
      tools: [
        { name: 'tool1', description: 'desc1', arguments: [] },
        { name: 'tool2', description: 'desc2', arguments: [] },
      ],
    });
  });
});

describe('doTargetPurposeDiscovery', () => {
  beforeEach(() => {
    mockSingleBar.mockImplementation(function () {
      return mockProgressBar;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should handle empty prompt', async () => {
    const mockResponses = [
      {
        done: false,
        question: 'What is your purpose?',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: 'Test limitations',
          tools: [
            {
              name: 'tool1',
              description: 'desc1',
              arguments: [{ name: 'a', description: 'd', type: 'string' }],
            },
          ],
          user: 'Test user',
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I am a test assistant'],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(function () {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const target = createMockProvider({
      id: 'test',
      response: { output: 'I am a test assistant' },
    });

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    expect(target.callApi).toHaveBeenCalledWith('What is your purpose?', {
      prompt: { raw: 'What is your purpose?', label: 'Target Discovery Question' },
      vars: { sessionId: expect.any(String) },
      bustCache: true,
    });

    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(2);
    expect(mockProgressBar.start).toHaveBeenCalledWith(5, 0);
    expect(mockProgressBar.increment).toHaveBeenCalledTimes(2);
    expect(mockProgressBar.stop).toHaveBeenCalledOnce();

    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      tools: [
        {
          name: 'tool1',
          description: 'desc1',
          arguments: [{ name: 'a', description: 'd', type: 'string' }],
        },
      ],
      user: 'Test user',
    });
  });

  it('should stop when the maximum turn count is reached', async () => {
    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            done: false,
            question: 'What else should I know?',
            state: {
              currentQuestionIndex: 0,
              answers: [],
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    const target = createMockProvider({
      id: 'test',
      response: { output: 'Another answer' },
    });

    await expect(doTargetPurposeDiscovery(target)).rejects.toThrow('Too many retries, giving up.');
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(10);
    expect(target.callApi).toHaveBeenCalledTimes(9);
    expect(mockProgressBar.start).toHaveBeenCalledWith(5, 0);
    expect(mockProgressBar.increment).toHaveBeenCalledTimes(10);
    expect(mockProgressBar.stop).toHaveBeenCalledOnce();
    expect(mockProgressBar.increment.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      mockProgressBar.stop.mock.invocationCallOrder[0]!,
    );
  });

  it('delegates auth to the fetch layer and never sends an Authorization header itself', async () => {
    // Single done=true turn so exactly one remote-generation request is made.
    mockedFetchWithProxy.mockResolvedValue(
      new Response(
        JSON.stringify({
          done: true,
          purpose: {
            purpose: 'Test purpose',
            limitations: 'Test limitations',
            tools: [],
            user: 'Test user',
          },
          state: { currentQuestionIndex: 0, answers: [] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const target = createMockProvider({ id: 'test', response: { output: 'ok' } });
    await doTargetPurposeDiscovery(target);

    // discover.ts must not attach the cloud token itself: the centralized fetch layer
    // injects it only for the configured cloud origin, so a custom
    // PROMPTFOO_REMOTE_GENERATION_URL can never receive the saved credential.
    expect(mockedFetchWithProxy).toHaveBeenCalled();
    for (const call of mockedFetchWithProxy.mock.calls) {
      const headers = (call[1]?.headers ?? {}) as Record<string, string>;
      const headerKeys = Object.keys(headers).map((key) => key.toLowerCase());
      expect(headerKeys).not.toContain('authorization');
    }
  });

  it('should render the prompt if passed in', async () => {
    const mockResponses = [
      {
        done: false,
        question: 'What is your purpose?',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: 'Test limitations',
          tools: [
            {
              name: 'tool1',
              description: 'desc1',
              arguments: [{ name: 'a', description: 'd', type: 'string' }],
            },
          ],
          user: 'Test user',
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I am a test assistant'],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(function () {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const target = createMockProvider({
      id: 'test',
      response: { output: 'I am a test assistant' },
    });
    const prompt = {
      raw: 'This is a test prompt {{prompt}}',
      label: 'Test Prompt',
    };
    const discoveredPurpose = await doTargetPurposeDiscovery(target, prompt);

    expect(target.callApi).toHaveBeenCalledWith('This is a test prompt What is your purpose?', {
      prompt: { raw: 'What is your purpose?', label: 'Target Discovery Question' },
      vars: { sessionId: expect.any(String) },
      bustCache: true,
    });

    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(2);

    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      tools: [
        {
          name: 'tool1',
          description: 'desc1',
          arguments: [{ name: 'a', description: 'd', type: 'string' }],
        },
      ],
      user: 'Test user',
    });
  });

  it('should preserve target and remote task usage in discovery results', async () => {
    const mockResponses = [
      {
        done: false,
        question: 'What is your purpose?',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
        tokenUsage: { total: 5, prompt: 3, completion: 2 },
      },
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: 'Test limitations',
          tools: [],
          user: 'Test user',
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I am a test assistant'],
        },
        tokenUsage: { total: 7, prompt: 4, completion: 3 },
      },
    ];

    mockedFetchWithProxy.mockImplementation(function () {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const target = createMockProvider({
      id: 'test',
      response: {
        output: 'I am a test assistant',
        tokenUsage: { total: 11, prompt: 6, completion: 5 },
      },
    });

    const discoveredPurpose = await doTargetPurposeDiscovery(target, undefined, false);

    expect(discoveredPurpose).toMatchObject({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      user: 'Test user',
      tokenUsage: {
        total: 23,
        prompt: 13,
        completion: 10,
        numRequests: 3,
      },
    });
  });

  it('should normalize string "null" values from server response', async () => {
    const mockResponses = [
      {
        done: false,
        question: 'What is your purpose?',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
      {
        done: true,
        purpose: {
          purpose: 'null',
          limitations: 'null',
          tools: [],
          user: 'null',
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['I cannot provide that information'],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(function () {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const target = {
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({ output: 'I cannot provide that information' }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    expect(discoveredPurpose).toEqual({
      purpose: null,
      limitations: null,
      tools: [],
      user: null,
    });
  });

  it('should throw immediately on non-OK HTTP response with an actionable hint', async () => {
    const errorBody = JSON.stringify({
      error: 'Invalid task',
      message: 'Unknown task: target-purpose-discovery',
    });

    mockedFetchWithProxy.mockResolvedValue(
      new Response(errorBody, {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const target = {
      id: () => 'test',
      callApi: vi.fn(),
    };

    const error = await doTargetPurposeDiscovery(target).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain(
      'Remote server returned HTTP 400: Unknown task: target-purpose-discovery',
    );
    expect(error.message).toContain('promptfoo@latest');
    // Should not retry — fetch should only be called once
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(1);
    expect(target.callApi).not.toHaveBeenCalled();
    expect(mockProgressBar.increment).toHaveBeenCalledOnce();
    expect(mockProgressBar.stop).toHaveBeenCalledOnce();
  });

  it('should surface an auth hint on 401 responses', async () => {
    mockedFetchWithProxy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const target = {
      id: () => 'test',
      callApi: vi.fn(),
    };

    const error = await doTargetPurposeDiscovery(target, undefined, false).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Remote server returned HTTP 401: Unauthorized');
    expect(error.message).toContain('promptfoo auth login');
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(1);
    expect(target.callApi).not.toHaveBeenCalled();
  });

  it('should throw with raw text on non-OK response with non-JSON body', async () => {
    mockedFetchWithProxy.mockResolvedValue(
      new Response('Service Unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const target = {
      id: () => 'test',
      callApi: vi.fn(),
    };

    await expect(doTargetPurposeDiscovery(target, undefined, false)).rejects.toThrow(
      'Remote server returned HTTP 503: Service Unavailable',
    );
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(1);
    expect(target.callApi).not.toHaveBeenCalled();
  });

  it('should fall back to status text on non-OK response with empty body', async () => {
    mockedFetchWithProxy.mockResolvedValue(
      new Response('', {
        status: 418,
        statusText: "I'm a teapot",
      }),
    );

    const target = {
      id: () => 'test',
      callApi: vi.fn(),
    };

    await expect(doTargetPurposeDiscovery(target, undefined, false)).rejects.toThrow(
      "Remote server returned HTTP 418: I'm a teapot",
    );
    expect(mockedFetchWithProxy).toHaveBeenCalledTimes(1);
    expect(target.callApi).not.toHaveBeenCalled();
  });

  it('should handle mixed valid/invalid tools from server', async () => {
    const mockResponses = [
      {
        done: false,
        question: 'What is your purpose?',
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: 'Test limitations',
          tools: [
            null,
            { name: 'tool1', description: 'desc1', arguments: [] },
            null,
            { name: 'tool2', description: 'desc2', arguments: [] },
          ],
          user: 'Test user',
        },
        state: {
          currentQuestionIndex: 1,
          answers: ['Test response'],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(function () {
      return Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    const target = {
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({ output: 'Test response' }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: 'Test limitations',
      tools: [
        { name: 'tool1', description: 'desc1', arguments: [] },
        { name: 'tool2', description: 'desc2', arguments: [] },
      ],
      user: 'Test user',
    });
  });
});
