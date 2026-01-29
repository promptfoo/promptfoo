import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as constants from '../src/constants';
import * as envars from '../src/envars';
import { getUserEmail } from '../src/globalConfig/accounts';
import { cloudConfig } from '../src/globalConfig/cloud';
import {
  createShareableUrl,
  determineShareDomain,
  hasEvalBeenShared,
  isSharingEnabled,
  stripAuthFromUrl,
} from '../src/share';
import { makeRequest } from '../src/util/cloud';

import type Eval from '../src/models/eval';
import type EvalResult from '../src/models/evalResult';

function buildMockEval(): Partial<Eval> {
  return {
    config: {},
    author: 'test@example.com',
    prompts: [
      { provider: 'openai:gpt-4', raw: 'prompt1', label: 'prompt1' },
      { provider: 'openai:gpt-4', raw: 'prompt2', label: 'prompt2' },
    ],
    useOldResults: vi.fn().mockReturnValue(false),
    loadResults: vi.fn().mockResolvedValue(undefined),
    results: [{ id: '1' }, { id: '2' }] as EvalResult[],
    save: vi.fn().mockResolvedValue(undefined),
    toEvaluateSummary: vi.fn().mockResolvedValue({}),
    getTable: vi.fn().mockResolvedValue([]),
    getTraces: vi.fn().mockResolvedValue([]),
    id: randomUUID(),
    getResultsCount: vi.fn().mockResolvedValue(2),
    getTotalResultRowCount: vi.fn().mockResolvedValue(2),
    fetchResultsBatched: vi.fn().mockImplementation(() => {
      const iterator = {
        called: false,
        next: async () => {
          if (!iterator.called) {
            iterator.called = true;
            return { done: false, value: [{ id: '1' }, { id: '2' }] as EvalResult[] };
          }
          return { done: true, value: undefined };
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
      return iterator;
    }),
  };
}

const mockFetch = vi.fn();

vi.mock('../src/globalConfig/cloud', () => {
  const cloudConfig = {
    isEnabled: vi.fn(),
    getApiHost: vi.fn(),
    getApiKey: vi.fn(),
    getCurrentTeamId: vi.fn(),
    getCurrentOrganizationId: vi.fn(),
    getAppUrl: vi.fn(),
  };

  return { cloudConfig };
});
vi.mock('../src/util/fetch/index.ts', () => ({
  fetchWithProxy: vi.fn((...args) => mockFetch(...args)),
  fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('../src/globalConfig/accounts', () => ({
  getUserEmail: vi.fn(),
  setUserEmail: vi.fn(),
  getAuthor: vi.fn().mockReturnValue('test-author@example.com'),
  getUserId: vi.fn(),
}));

vi.mock('../src/util/cloud', () => ({
  makeRequest: vi.fn(),
  checkCloudPermissions: vi.fn().mockResolvedValue(undefined),
  getOrgContext: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/envars', () => ({
  getEnvBool: vi.fn(),
  getEnvInt: vi.fn(),
  getEnvString: vi.fn().mockReturnValue(''),
  getEnvFloat: vi.fn(),
  isCI: vi.fn(),
}));

vi.mock('../src/constants', async () => {
  const actual = await vi.importActual<typeof import('../src/constants')>('../src/constants');
  return {
    ...actual,
    DEFAULT_API_BASE_URL: 'https://api.promptfoo.app',
    getShareApiBaseUrl: vi.fn().mockReturnValue('https://api.promptfoo.app'),
    getDefaultShareViewBaseUrl: vi.fn().mockReturnValue('https://promptfoo.app'),
    getShareViewBaseUrl: vi.fn().mockReturnValue('https://promptfoo.app'),
  };
});

describe('stripAuthFromUrl', () => {
  it('removes username and password from URL', () => {
    const input = 'https://user:pass@example.com/path?query=value#hash';
    const expected = 'https://example.com/path?query=value#hash';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('handles URLs without auth info', () => {
    const input = 'https://example.com/path?query=value#hash';
    expect(stripAuthFromUrl(input)).toBe(input);
  });

  it('handles URLs with only username', () => {
    const input = 'https://user@example.com/path';
    const expected = 'https://example.com/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('handles URLs with special characters in auth', () => {
    const input = 'https://user%40:p@ss@example.com/path';
    const expected = 'https://example.com/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('returns original string for invalid URLs', () => {
    const input = 'not a valid url';
    expect(stripAuthFromUrl(input)).toBe(input);
  });

  it('handles URLs with IP addresses', () => {
    const input = 'http://user:pass@192.168.1.1:8080/path';
    const expected = 'http://192.168.1.1:8080/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });
});

describe('isSharingEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    // Reset the mock to default value for each test
    vi.mocked(constants.getShareApiBaseUrl).mockReturnValue('https://api.promptfoo.app');
  });

  it('returns true when sharing config is set in eval record', () => {
    const mockEval: Partial<Eval> = {
      config: {
        sharing: {
          apiBaseUrl: 'https://custom-api.example.com',
        },
      },
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(true);
  });

  it('returns true when sharing env URL is set and not api.promptfoo.app', () => {
    vi.mocked(constants.getShareApiBaseUrl).mockReturnValue('https://custom-api.example.com');

    const mockEval: Partial<Eval> = {
      config: {},
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(true);
  });

  it('returns true when cloud sharing is enabled', () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://cloud-api.example.com');

    const mockEval: Partial<Eval> = {
      config: {},
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(true);
  });

  it('returns false when no sharing options are enabled', () => {
    // Explicitly ensure we're using the default mock return value
    vi.mocked(constants.getShareApiBaseUrl).mockReturnValue('https://api.promptfoo.app');
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {},
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(false);
  });

  it('returns false when sharing config is not an object', () => {
    // Explicitly ensure we're using the default mock return value
    vi.mocked(constants.getShareApiBaseUrl).mockReturnValue('https://api.promptfoo.app');
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {
        sharing: true,
      },
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(false);
  });
});

describe('determineShareDomain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(envars.getEnvString).mockImplementation((_key: string) => '');
  });

  it('should use DEFAULT_SHARE_VIEW_BASE_URL when no custom domain is specified', () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {},
      id: 'test-eval-id',
    };

    const result = determineShareDomain(mockEval as Eval);
    expect(result.domain).toBe('https://promptfoo.app');
  });

  it('should use PROMPTFOO_REMOTE_APP_BASE_URL when specified', () => {
    const customDomain = 'https://my-custom-instance.com';
    vi.mocked(envars.getEnvString).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
        return customDomain;
      }
      return '';
    });

    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {},
      id: 'test-eval-id',
    };

    const result = determineShareDomain(mockEval as Eval);
    expect(result.domain).toBe(customDomain);
  });

  it('should use config sharing.appBaseUrl when provided', () => {
    const configAppBaseUrl = 'https://config-specified-domain.com';

    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {
        sharing: {
          appBaseUrl: configAppBaseUrl,
        },
      },
      id: 'test-eval-id',
    };

    const result = determineShareDomain(mockEval as Eval);
    expect(result.domain).toBe(configAppBaseUrl);
  });

  it('should prioritize config sharing.appBaseUrl over environment variables', () => {
    const configAppBaseUrl = 'https://config-specified-domain.com';
    const envAppBaseUrl = 'https://env-specified-domain.com';

    vi.mocked(envars.getEnvString).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
        return envAppBaseUrl;
      }
      return '';
    });

    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {
        sharing: {
          appBaseUrl: configAppBaseUrl,
        },
      },
      id: 'test-eval-id',
    };

    const result = determineShareDomain(mockEval as Eval);
    expect(result.domain).toBe(configAppBaseUrl);
  });
});

describe('createShareableUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(envars.getEnvString).mockImplementation((_key: string) => '');
    vi.mocked(envars.isCI).mockReturnValue(false);
    vi.mocked(envars.getEnvBool).mockReturnValue(false);
    mockFetch.mockReset();
    // Mock process.stdout.isTTY
    process.stdout.isTTY = false;
  });

  it('creates correct URL for cloud config and updates author', async () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);
    vi.mocked(getUserEmail).mockReturnValue('logged-in@example.com');

    const mockEval = buildMockEval();
    mockEval.author = 'original@example.com';

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'mock-eval-id' }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBe(`https://app.example.com/eval/mock-eval-id`);
  });

  it('Cloud: creates correct URL (uses server-assigned ID for idempotency)', async () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

    const originalId = randomUUID();
    const newId = randomUUID();
    const mockEval = buildMockEval();
    mockEval.id = originalId;

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: newId }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBe(`https://app.example.com/eval/${newId}`);

    // Verify idempotency
    // Mock the calls again for the second attempt
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: newId }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result2 = await createShareableUrl(mockEval as Eval);
    expect(result2).toEqual(result);
  });

  it('Self-Hosted: creates unique URL for each share call', async () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    const originalId = randomUUID();
    const newId = randomUUID();
    const mockEval = buildMockEval();
    mockEval.id = originalId;

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: newId }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBe(`https://promptfoo.app/eval/${newId}`);

    // Mock for second call
    const newId2 = randomUUID();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: newId2 }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const result2 = await createShareableUrl(mockEval as Eval);
    expect(result2).not.toEqual(result);
  });

  describe('chunked sending', () => {
    let mockEval: Partial<Eval>;

    beforeEach(() => {
      mockEval = buildMockEval();

      vi.mocked(getUserEmail).mockReturnValue('test@example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      vi.mocked(envars.getEnvString).mockImplementation((_key: string) => '');

      mockFetch.mockReset();
    });

    it('sends chunked eval to cloud', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

      // Set up mock responses
      mockFetch
        .mockImplementationOnce((_url, _options) => {
          // Initial eval data
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'mock-eval-id' }),
          });
        })
        .mockImplementationOnce((_url, _options) => {
          // Chunk of results
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        });

      await createShareableUrl(mockEval as Eval);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[]'),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/results/mock-eval-id/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[{"id":"1"},{"id":"2"}]'),
        }),
      );
    });

    it('sends chunked eval when open source self hosted', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockEval.id }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const result = await createShareableUrl(mockEval as Eval);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/eval'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[]'),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(`/api/eval/${mockEval.id}/results`),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[{"id":"1"},{"id":"2"}]'),
        }),
      );
      expect(result).toBe(`https://promptfoo.app/eval/${mockEval.id}`);
    });

    it('sends eval with trace data when traces are available', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

      const mockEvalWithTraces = buildMockEval();
      const mockTraces = [
        {
          traceId: 'trace-123',
          evaluationId: mockEvalWithTraces.id as string,
          testCaseId: 'test-case-1',
          metadata: { test: 'metadata' },
          spans: [
            {
              spanId: 'span-1',
              name: 'Test Span',
              startTime: 1000,
              endTime: 2000,
              statusCode: 1,
            },
          ],
        },
      ];
      mockEvalWithTraces.getTraces = vi.fn().mockResolvedValue(mockTraces);

      // Mock the initial eval send
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      });
      // Mock the chunk send
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await createShareableUrl(mockEvalWithTraces as Eval);

      // Verify traces are included in the initial request
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"traces":['),
        }),
      );

      // Verify trace data structure is correct
      const firstCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(firstCall[1].body);
      expect(requestBody.traces).toHaveLength(1);
      expect(requestBody.traces[0]).toMatchObject({
        traceId: 'trace-123',
        evaluationId: mockEvalWithTraces.id,
        testCaseId: 'test-case-1',
        metadata: { test: 'metadata' },
      });
      expect(requestBody.traces[0].spans).toHaveLength(1);
      expect(requestBody.traces[0].spans[0]).toMatchObject({
        spanId: 'span-1',
        name: 'Test Span',
        startTime: 1000,
        endTime: 2000,
        statusCode: 1,
      });
    });

    it('sends eval with empty traces array when no traces are available', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

      const mockEvalNoTraces = buildMockEval();
      mockEvalNoTraces.getTraces = vi.fn().mockResolvedValue([]);

      // Mock the initial eval send
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      });
      // Mock the chunk send
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await createShareableUrl(mockEvalNoTraces as Eval);

      // Verify empty traces array is included
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"traces":[]'),
        }),
      );

      const firstCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(firstCall[1].body);
      expect(requestBody.traces).toEqual([]);
    });

    it('handles getTraces errors gracefully', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

      const mockEvalTracesError = buildMockEval();
      mockEvalTracesError.getTraces = vi
        .fn()
        .mockRejectedValue(new Error('Failed to fetch traces'));

      // Should throw when an error occurs
      await expect(createShareableUrl(mockEvalTracesError as Eval)).rejects.toThrow(
        'Failed to fetch traces',
      );
    });
  });

  it('creates URL with custom domain from environment variables', async () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const customDomain = 'https://my-custom-instance.com';
    vi.mocked(envars.getEnvString).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
        return customDomain;
      }
      return '';
    });

    const mockEval = buildMockEval();

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: mockEval.id }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await createShareableUrl(mockEval as Eval);

    expect(result).toBe(`${customDomain}/eval/?evalId=${mockEval.id}`);
  });
});

describe('adaptive chunk retry', () => {
  let mockEval: Partial<Eval>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(envars.getEnvString).mockImplementation((_key: string) => '');
    vi.mocked(envars.isCI).mockReturnValue(false);
    vi.mocked(envars.getEnvBool).mockReturnValue(false);
    mockFetch.mockReset();
    process.stdout.isTTY = false;

    vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);
    vi.mocked(getUserEmail).mockReturnValue('test@example.com');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('splits chunk on 413 Payload Too Large and retries', async () => {
    // Create an eval with 4 results
    const results = [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] as EvalResult[];
    mockEval = {
      ...buildMockEval(),
      results,
      getTotalResultRowCount: vi.fn().mockResolvedValue(4),
      fetchResultsBatched: vi.fn().mockImplementation(() => {
        let called = false;
        return {
          next: async () => {
            if (!called) {
              called = true;
              return { done: false, value: results };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      }),
    };

    // Mock responses:
    // 1. Initial eval send - success
    // 2. First chunk (4 results) - 413 error
    // 3. First half (2 results) - success
    // 4. Second half (2 results) - success
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
        text: () => Promise.resolve('Payload too large'),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

    const result = await createShareableUrl(mockEval as Eval);

    expect(result).toBe('https://app.example.com/eval/mock-eval-id');
    // 1 initial + 3 chunk attempts (1 failed + 2 successful splits)
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('splits chunk on network timeout (fetch failed) and retries', async () => {
    const results = [{ id: '1' }, { id: '2' }] as EvalResult[];
    mockEval = {
      ...buildMockEval(),
      results,
      getTotalResultRowCount: vi.fn().mockResolvedValue(2),
      fetchResultsBatched: vi.fn().mockImplementation(() => {
        let called = false;
        return {
          next: async () => {
            if (!called) {
              called = true;
              return { done: false, value: results };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      }),
    };

    // Mock responses:
    // 1. Initial eval send - success
    // 2. First chunk (2 results) - network timeout
    // 3. First half (1 result) - success
    // 4. Second half (1 result) - success
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      })
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

    const result = await createShareableUrl(mockEval as Eval);

    expect(result).toBe('https://app.example.com/eval/mock-eval-id');
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('fails when single result is too large', async () => {
    const results = [{ id: '1' }] as EvalResult[];
    mockEval = {
      ...buildMockEval(),
      results,
      getTotalResultRowCount: vi.fn().mockResolvedValue(1),
      fetchResultsBatched: vi.fn().mockImplementation(() => {
        let called = false;
        return {
          next: async () => {
            if (!called) {
              called = true;
              return { done: false, value: results };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      }),
    };

    // Initial eval send succeeds, but single result is too large, then rollback
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 413,
        statusText: 'Payload Too Large',
        text: () => Promise.resolve('Payload too large'),
      })
      .mockResolvedValueOnce({
        ok: true, // rollback succeeds
      });

    // Should throw error (rollback is attempted)
    await expect(createShareableUrl(mockEval as Eval)).rejects.toThrow(
      'Failed to send even a single result',
    );
  });

  it('throws on unknown errors without retry', async () => {
    const results = [{ id: '1' }, { id: '2' }] as EvalResult[];
    mockEval = {
      ...buildMockEval(),
      results,
      getTotalResultRowCount: vi.fn().mockResolvedValue(2),
      fetchResultsBatched: vi.fn().mockImplementation(() => {
        let called = false;
        return {
          next: async () => {
            if (!called) {
              called = true;
              return { done: false, value: results };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
      }),
    };

    // Initial success, then server error (not 413), then rollback
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error'),
      })
      .mockResolvedValueOnce({
        ok: true, // rollback succeeds
      });

    // Should throw without retrying (unknown error type)
    await expect(createShareableUrl(mockEval as Eval)).rejects.toThrow(
      '500 Internal Server Error: Server error',
    );
    // 3 calls: initial + one failed chunk + rollback (no retry for 500)
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});

describe('hasEvalBeenShared', () => {
  beforeAll(() => {
    mockFetch.mockReset();
  });

  beforeEach(() => {
    // Setup cloudConfig mocks for team-scoped checking
    vi.mocked(cloudConfig.getCurrentOrganizationId).mockReturnValue('org-123');
    vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue('team-456');
  });

  it('returns true if the server does not return 404', async () => {
    const mockEval: Partial<Eval> = {
      config: {},
      id: randomUUID(),
    };

    vi.mocked(makeRequest).mockResolvedValue({ status: 200 } as Response);

    const result = await hasEvalBeenShared(mockEval as Eval);
    expect(result).toBe(true);
    // Verify teamId is passed in the request URL
    expect(makeRequest).toHaveBeenCalledWith(expect.stringContaining('teamId=team-456'), 'GET');
  });

  it('returns false if the server returns 404', async () => {
    const mockEval: Partial<Eval> = {
      config: {},
      id: randomUUID(),
    };

    vi.mocked(makeRequest).mockResolvedValue({ status: 404 } as Response);

    const result = await hasEvalBeenShared(mockEval as Eval);
    expect(result).toBe(false);
  });

  it('makes request without teamId when no current team is set', async () => {
    vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

    const mockEval: Partial<Eval> = {
      config: {},
      id: randomUUID(),
    };

    vi.mocked(makeRequest).mockResolvedValue({ status: 200 } as Response);

    const result = await hasEvalBeenShared(mockEval as Eval);
    expect(result).toBe(true);
    // Verify request is made without teamId
    expect(makeRequest).toHaveBeenCalledWith(expect.not.stringContaining('teamId='), 'GET');
  });
});
