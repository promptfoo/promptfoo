import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProvider } from '../../src/types/providers';

// Use vi.hoisted to create mock functions that persist across clearAllMocks
const mockEvaluate = vi.hoisted(() => vi.fn());
const mockToEvaluateSummary = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    results: [
      {
        response: {
          output: 'Hello! How can I help you?',
          raw: 'Hello! How can I help you?',
          sessionId: 'session-123',
          metadata: { transformedRequest: { body: '{}' } },
        },
        error: undefined,
      },
    ],
  }),
);
const mockNeverGenerateRemote = vi.hoisted(() => vi.fn().mockReturnValue(false));
const mockFetchWithProxy = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      message: 'Test completed successfully',
      error: null,
      changes_needed: false,
    }),
  }),
);
const mockDoRemoteGrading = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    pass: true,
    reason: 'Session is working correctly',
  }),
);
const mockDetermineEffectiveSessionSource = vi.hoisted(() => vi.fn().mockReturnValue('client'));

vi.mock('dedent', () => ({
  default: (strings: TemplateStringsArray, ...values: unknown[]) => {
    let result = '';
    strings.forEach((str, i) => {
      result += str + (values[i] ?? '');
    });
    return result;
  },
}));

vi.mock('../../src/evaluator', () => ({
  evaluate: mockEvaluate,
}));

vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    getApiHost: vi.fn().mockReturnValue('https://api.example.com'),
    getApiKey: vi.fn().mockReturnValue('test-api-key'),
  },
}));

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/models/eval', () => {
  return {
    default: class MockEval {
      toEvaluateSummary = mockToEvaluateSummary;
    },
  };
});

vi.mock('../../src/redteam/remoteGeneration', () => ({
  neverGenerateRemote: mockNeverGenerateRemote,
}));

vi.mock('../../src/remoteGrading', () => ({
  doRemoteGrading: mockDoRemoteGrading,
}));

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: mockFetchWithProxy,
}));

vi.mock('../../src/util/sanitizer', () => ({
  sanitizeObject: vi.fn((obj: unknown) => obj),
}));

vi.mock('../../src/validators/util', () => ({
  determineEffectiveSessionSource: mockDetermineEffectiveSessionSource,
  formatConfigBody: vi.fn().mockReturnValue('None configured'),
  formatConfigHeaders: vi.fn().mockReturnValue('None configured'),
  validateSessionConfig: vi.fn(),
}));

import { testProviderConnectivity, testProviderSession } from '../../src/validators/testProvider';

beforeEach(() => {
  // Reset call history but keep implementations from vi.hoisted
  mockEvaluate.mockReset();
  mockNeverGenerateRemote.mockReset().mockReturnValue(false);
  mockDetermineEffectiveSessionSource.mockReset().mockReturnValue('client');
  mockDoRemoteGrading.mockReset().mockResolvedValue({
    pass: true,
    reason: 'Session is working correctly',
  });
  mockToEvaluateSummary.mockReset().mockResolvedValue({
    results: [
      {
        response: {
          output: 'Hello! How can I help you?',
          raw: 'Hello! How can I help you?',
          sessionId: 'session-123',
          metadata: { transformedRequest: { body: '{}' } },
        },
        error: undefined,
      },
    ],
  });
  mockFetchWithProxy.mockReset().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({
      message: 'Test completed successfully',
      error: null,
      changes_needed: false,
    }),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function createMockProvider(overrides?: Record<string, unknown>): ApiProvider {
  return {
    id: () => 'test-provider',
    callApi: vi.fn().mockResolvedValue({
      output: 'Hello! How can I help you?',
      sessionId: 'session-123',
    }),
    config: {},
    ...overrides,
  } as unknown as ApiProvider;
}

describe('testProviderConnectivity', () => {
  it('should return success when provider evaluation succeeds', async () => {
    const provider = createMockProvider();
    const result = await testProviderConnectivity({ provider });

    expect(result.success).toBe(true);
    expect(result.message).toBe('Test completed successfully');
    expect(mockEvaluate).toHaveBeenCalled();
  });

  it('should use custom prompt when provided', async () => {
    const provider = createMockProvider();
    await testProviderConnectivity({ provider, prompt: 'Custom prompt' });

    expect(mockEvaluate).toHaveBeenCalled();
    const callArgs = mockEvaluate.mock.calls[0];
    expect(callArgs[0].prompts[0].raw).toBe('Custom prompt');
  });

  it('should generate test values for input variables', async () => {
    const provider = createMockProvider();
    await testProviderConnectivity({
      provider,
      inputs: { name: 'User name', topic: 'Discussion topic' },
    });

    expect(mockEvaluate).toHaveBeenCalled();
    const callArgs = mockEvaluate.mock.calls[0];
    const vars = callArgs[0].tests[0].vars;
    expect(vars['name']).toBe('test_name');
    expect(vars['topic']).toBe('test_topic');
  });

  it('should return raw result when remote grading is disabled', async () => {
    mockNeverGenerateRemote.mockReturnValue(true);
    const provider = createMockProvider();

    const result = await testProviderConnectivity({ provider });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Remote grading disabled');
    expect(mockFetchWithProxy).not.toHaveBeenCalled();
  });

  it('should return error when evaluation result has error', async () => {
    mockNeverGenerateRemote.mockReturnValue(true);
    mockToEvaluateSummary.mockResolvedValueOnce({
      results: [
        {
          response: { output: null },
          error: 'Connection refused',
        },
      ],
    });

    const provider = createMockProvider();
    const result = await testProviderConnectivity({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Connection refused');
  });

  it('should handle evaluation throwing an error', async () => {
    mockEvaluate.mockRejectedValueOnce(new Error('Evaluation failed'));

    const provider = createMockProvider();
    const result = await testProviderConnectivity({ provider });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Evaluation failed');
  });

  it('should handle remote analysis endpoint failure', async () => {
    mockFetchWithProxy.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
    } as any);

    const provider = createMockProvider();
    const result = await testProviderConnectivity({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('review the provider response manually');
  });

  it('should handle remote analysis endpoint throwing', async () => {
    mockFetchWithProxy.mockRejectedValueOnce(new Error('Network error'));

    const provider = createMockProvider();
    const result = await testProviderConnectivity({ provider });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Network error');
  });

  it('should report changes_needed from analysis', async () => {
    mockFetchWithProxy.mockResolvedValueOnce({
      ok: true,
      json: vi.fn().mockResolvedValue({
        message: 'Configuration needs changes',
        error: null,
        changes_needed: true,
        changes_needed_reason: 'Missing auth header',
        changes_needed_suggestions: ['Add Authorization header'],
      }),
    } as any);

    const provider = createMockProvider();
    const result = await testProviderConnectivity({ provider });

    expect(result.success).toBe(false);
    expect(result.analysis).toBeDefined();
    expect(result.analysis?.changes_needed).toBe(true);
    expect(result.analysis?.changes_needed_reason).toBe('Missing auth header');
  });

  it('should not set sessionId var when provider has sessionParser config', async () => {
    const provider = createMockProvider({
      config: { sessionParser: 'response.headers.session' },
    });

    await testProviderConnectivity({ provider });

    expect(mockEvaluate).toHaveBeenCalled();
    const callArgs = mockEvaluate.mock.calls[0];
    const vars = callArgs[0].tests[0].vars;
    expect(vars).not.toHaveProperty('sessionId');
  });

  it('should use default prompt when none provided', async () => {
    const provider = createMockProvider();
    await testProviderConnectivity({ provider });

    const callArgs = mockEvaluate.mock.calls[0];
    expect(callArgs[0].prompts[0].raw).toBe('Hello World!');
  });
});

describe('testProviderSession', () => {
  it('should return success when session is working', async () => {
    const provider = createMockProvider();
    const result = await testProviderSession({ provider });

    expect(result.success).toBe(true);
    expect(result.message).toContain('working correctly');
  });

  it('should return failure when first request fails', async () => {
    const provider = createMockProvider({
      callApi: vi.fn().mockResolvedValue({
        error: 'Connection timeout',
        output: null,
      }),
    });

    const result = await testProviderSession({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('First request failed');
    expect(result.error).toBe('Connection timeout');
  });

  it('should return failure when second request fails', async () => {
    const callApi = vi
      .fn()
      .mockResolvedValueOnce({
        output: 'Hello! I can help with many things.',
        sessionId: 'session-123',
      })
      .mockResolvedValueOnce({
        error: 'Server error',
        output: null,
      });

    const provider = createMockProvider({ callApi });
    const result = await testProviderSession({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Second request failed');
  });

  it('should return manual review message when remote grading is disabled', async () => {
    mockNeverGenerateRemote.mockReturnValue(true);
    const provider = createMockProvider();

    const result = await testProviderSession({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Remote grading is disabled');
  });

  it('should return failure when session grading fails', async () => {
    mockDoRemoteGrading.mockRejectedValueOnce(new Error('Grading service unavailable'));
    const provider = createMockProvider();

    const result = await testProviderSession({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to evaluate session');
  });

  it('should return failure when session is not working', async () => {
    mockDoRemoteGrading.mockResolvedValueOnce({
      pass: false,
      score: 0,
      reason: 'Provider did not remember the previous question',
    });
    const provider = createMockProvider();

    const result = await testProviderSession({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Session is NOT working');
  });

  it('should handle server session source with extraction failure', async () => {
    mockDetermineEffectiveSessionSource.mockReturnValue('server');
    const provider = createMockProvider({
      callApi: vi.fn().mockResolvedValue({
        output: 'Hello!',
        // No sessionId returned
      }),
      getSessionId: vi.fn().mockReturnValue(undefined),
    });

    const result = await testProviderSession({ provider });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Session extraction failed');
  });

  it('should handle input variables for multi-input configurations', async () => {
    const callApi = vi.fn().mockResolvedValue({
      output: 'Response',
      sessionId: 'session-123',
    });
    const provider = createMockProvider({ callApi });

    await testProviderSession({
      provider,
      inputs: { user_message: 'Main input', context: 'Additional context' },
      mainInputVariable: 'user_message',
    });

    expect(callApi).toHaveBeenCalledTimes(2);
    const firstContext = callApi.mock.calls[0][1];
    expect(firstContext.vars).toHaveProperty('context', 'test_context');
    expect(firstContext.vars).toHaveProperty('user_message', 'What can you help me with?');
  });

  it('should handle errors thrown during session test', async () => {
    const provider = createMockProvider({
      callApi: vi.fn().mockRejectedValue(new Error('Unexpected error')),
    });

    const result = await testProviderSession({ provider });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unexpected error');
  });

  it('should include session details in successful response', async () => {
    const provider = createMockProvider();
    const result = await testProviderSession({ provider });

    expect(result.details).toBeDefined();
    expect(result.details?.sessionSource).toBe('client');
    expect(result.details?.request1).toBeDefined();
    expect(result.details?.response1).toBeDefined();
    expect(result.details?.request2).toBeDefined();
    expect(result.details?.response2).toBeDefined();
  });

  it('should include reason from grading judge', async () => {
    mockDoRemoteGrading.mockResolvedValueOnce({
      pass: true,
      reason: 'The model remembered the first question',
    });
    const provider = createMockProvider();

    const result = await testProviderSession({ provider });

    expect(result.success).toBe(true);
    expect(result.reason).toBe('The model remembered the first question');
  });

  it('should generate dummy values for non-main input variables', async () => {
    const callApi = vi.fn().mockResolvedValue({
      output: 'Response',
      sessionId: 'session-123',
    });
    const provider = createMockProvider({ callApi });

    await testProviderSession({
      provider,
      inputs: {
        user_message: 'Main',
        system_prompt: 'System instruction',
        language: 'Language preference',
      },
      mainInputVariable: 'user_message',
    });

    const firstContext = callApi.mock.calls[0][1];
    expect(firstContext.vars).toHaveProperty('system_prompt', 'test_system_prompt');
    expect(firstContext.vars).toHaveProperty('language', 'test_language');
    // main input variable should have the actual prompt
    expect(firstContext.vars).toHaveProperty('user_message', 'What can you help me with?');
  });
});
