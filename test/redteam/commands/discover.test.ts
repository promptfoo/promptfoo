import { fetchWithProxy } from '../../../src/fetch';
import {
  ArgsSchema,
  doTargetPurposeDiscovery,
  normalizeTargetPurposeDiscoveryResult,
} from '../../../src/redteam/commands/discover';

jest.mock('../../../src/fetch');

const mockedFetchWithProxy = jest.mocked(fetchWithProxy);

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

  it('should parse args without rate limit options (removed active probing)', () => {
    const args = {
      config: 'test',
    };

    const { success, data } = ArgsSchema.safeParse(args);
    expect(success).toBe(true);
    expect(data?.config).toBe('test');
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
    jest.clearAllMocks();
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

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'I am a test assistant' }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    expect(target.callApi).toHaveBeenCalledWith('What is your purpose?', {
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
      rateLimit: {
        detected: false,
        detectionMethod: 'none',
        confidence: 'high',
      },
    });
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

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'I am a test assistant' }),
    };
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
      rateLimit: {
        detected: false,
        detectionMethod: 'none',
        confidence: 'high',
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

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'I cannot provide that information' }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target);

    expect(discoveredPurpose).toEqual({
      purpose: null,
      limitations: null,
      tools: [],
      user: null,
      rateLimit: {
        detected: false,
        detectionMethod: 'none',
        confidence: 'high',
      },
    });
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

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'Test response' }),
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
      rateLimit: {
        detected: false,
        detectionMethod: 'none',
        confidence: 'high',
      },
    });
  });

  it('should include rate limit discovery by default', async () => {
    const mockResponses = [
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: null,
          tools: [],
          user: null,
        },
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test-provider',
      callApi: jest.fn().mockResolvedValue({
        output: 'I am a test assistant',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-ratelimit-limit': '100',
              'x-ratelimit-remaining': '99',
            },
          },
        },
      }),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target, undefined, false);

    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: null,
      tools: [],
      user: null,
      rateLimit: {
        detected: true,
        detectionMethod: 'headers',
        confidence: 'medium',
        requestsPerMinute: 100,
        requestsPerSecond: 1,
        timeWindow: 'unknown',
        headers: {
          limit: '100',
          remaining: '99',
        },
        warnings: ['Unable to determine time window for rate limit 100, assuming per-minute'],
      },
    });
  });

  it('should handle rate limit discovery errors gracefully', async () => {
    const mockResponses = [
      {
        done: true,
        purpose: {
          purpose: 'Test purpose',
          limitations: null,
          tools: [],
          user: null,
        },
        state: {
          currentQuestionIndex: 0,
          answers: [],
        },
      },
    ];

    mockedFetchWithProxy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(mockResponses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const target = {
      id: () => 'test-provider',
      callApi: jest.fn().mockRejectedValue(new Error('Network error')),
    };

    const discoveredPurpose = await doTargetPurposeDiscovery(target, undefined, false);

    expect(discoveredPurpose).toEqual({
      purpose: 'Test purpose',
      limitations: null,
      tools: [],
      user: null,
      rateLimit: {
        detected: false,
        detectionMethod: 'none',
        confidence: 'low',
      },
    });
  });
});
