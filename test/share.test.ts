import { randomUUID } from 'node:crypto';

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

import type EvalResult from '../src/models/evalResult';

import type Eval from '../src/models/eval';

function buildMockEval(): Partial<Eval> {
  return {
    config: {},
    author: 'test@example.com',
    prompts: [
      { provider: 'openai:gpt-4', raw: 'prompt1', label: 'prompt1' },
      { provider: 'openai:gpt-4', raw: 'prompt2', label: 'prompt2' },
    ],
    useOldResults: jest.fn().mockReturnValue(false),
    loadResults: jest.fn().mockResolvedValue(undefined),
    results: [{ id: '1' }, { id: '2' }] as EvalResult[],
    save: jest.fn().mockResolvedValue(undefined),
    toEvaluateSummary: jest.fn().mockResolvedValue({}),
    getTable: jest.fn().mockResolvedValue([]),
    id: randomUUID(),
    getResultsCount: jest.fn().mockResolvedValue(2),
    fetchResultsBatched: jest.fn().mockImplementation(() => {
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

const mockFetch = jest.fn();

jest.mock('../src/globalConfig/cloud');
jest.mock('../src/fetch', () => ({
  fetchWithProxy: jest.fn().mockImplementation((...args) => mockFetch(...args)),
}));

jest.mock('../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(),
  setUserEmail: jest.fn(),
  getAuthor: jest.fn().mockReturnValue('test-author@example.com'),
}));

jest.mock('../src/util/cloud', () => ({
  makeRequest: jest.fn(),
}));

jest.mock('../src/envars', () => ({
  getEnvBool: jest.fn(),
  getEnvInt: jest.fn(),
  getEnvString: jest.fn().mockReturnValue(''),
  isCI: jest.fn(),
}));

jest.mock('../src/constants', () => {
  const actual = jest.requireActual('../src/constants');
  return {
    ...actual,
    DEFAULT_API_BASE_URL: 'https://api.promptfoo.app',
    getShareApiBaseUrl: jest.fn().mockReturnValue('https://api.promptfoo.app'),
    getDefaultShareViewBaseUrl: jest.fn().mockReturnValue('https://promptfoo.app'),
    getShareViewBaseUrl: jest.fn().mockReturnValue('https://promptfoo.app'),
  };
});

jest.mock('../src/tracing/store', () => ({
  getTraceStore: jest.fn().mockReturnValue({
    getTracesByEvaluation: jest.fn(),
  }),
}));

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
    jest.clearAllMocks();
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    // Reset the mock to default value for each test
    jest
      .requireMock('../src/constants')
      .getShareApiBaseUrl.mockReturnValue('https://api.promptfoo.app');
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
    jest
      .requireMock('../src/constants')
      .getShareApiBaseUrl.mockReturnValue('https://custom-api.example.com');

    const mockEval: Partial<Eval> = {
      config: {},
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(true);
  });

  it('returns true when cloud sharing is enabled', () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://cloud-api.example.com');

    const mockEval: Partial<Eval> = {
      config: {},
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(true);
  });

  it('returns false when no sharing options are enabled', () => {
    // Explicitly ensure we're using the default mock return value
    jest
      .requireMock('../src/constants')
      .getShareApiBaseUrl.mockReturnValue('https://api.promptfoo.app');
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {},
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(false);
  });

  it('returns false when sharing config is not an object', () => {
    // Explicitly ensure we're using the default mock return value
    jest
      .requireMock('../src/constants')
      .getShareApiBaseUrl.mockReturnValue('https://api.promptfoo.app');
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

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
    jest.clearAllMocks();
    jest.requireMock('../src/envars').getEnvString.mockImplementation((_key: string) => '');
  });

  it('should use DEFAULT_SHARE_VIEW_BASE_URL when no custom domain is specified', () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {},
      id: 'test-eval-id',
    };

    const result = determineShareDomain(mockEval as Eval);
    expect(result.domain).toBe('https://promptfoo.app');
    expect(result.isPublicShare).toBe(true);
  });

  it('should use PROMPTFOO_REMOTE_APP_BASE_URL when specified', () => {
    const customDomain = 'https://my-custom-instance.com';
    jest.requireMock('../src/envars').getEnvString.mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
        return customDomain;
      }
      return '';
    });

    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const mockEval: Partial<Eval> = {
      config: {},
      id: 'test-eval-id',
    };

    const result = determineShareDomain(mockEval as Eval);
    expect(result.domain).toBe(customDomain);
    expect(result.isPublicShare).toBe(true);
  });

  it('should use config sharing.appBaseUrl when provided', () => {
    const configAppBaseUrl = 'https://config-specified-domain.com';

    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

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
    expect(result.isPublicShare).toBe(false);
  });

  it('should prioritize config sharing.appBaseUrl over environment variables', () => {
    const configAppBaseUrl = 'https://config-specified-domain.com';
    const envAppBaseUrl = 'https://env-specified-domain.com';

    jest.requireMock('../src/envars').getEnvString.mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
        return envAppBaseUrl;
      }
      return '';
    });

    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

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
    expect(result.isPublicShare).toBe(false);
  });
});

describe('createShareableUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.requireMock('../src/envars').getEnvString.mockImplementation((_key: string) => '');
    jest.requireMock('../src/envars').isCI.mockReturnValue(false);
    jest.requireMock('../src/envars').getEnvBool.mockReturnValue(false);
    mockFetch.mockReset();
    // Mock process.stdout.isTTY
    process.stdout.isTTY = false;
  });

  it('creates correct URL for cloud config and updates author', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    jest.mocked(getUserEmail).mockReturnValue('logged-in@example.com');

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
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');

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
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
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

      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      jest.requireMock('../src/envars').getEnvString.mockImplementation((_key: string) => '');

      mockFetch.mockReset();
    });

    it('sends chunked eval to cloud', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      // Set up mock responses
      mockFetch
        .mockImplementationOnce((url, options) => {
          // Initial eval data
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 'mock-eval-id' }),
          });
        })
        .mockImplementationOnce((url, options) => {
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
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

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
  });

  it('creates URL with custom domain from environment variables', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const customDomain = 'https://my-custom-instance.com';
    jest.requireMock('../src/envars').getEnvString.mockImplementation((key: string) => {
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

describe('hasEvalBeenShared', () => {
  beforeAll(() => {
    mockFetch.mockReset();
  });

  it('returns true if the server does not return 404', async () => {
    const mockEval: Partial<Eval> = {
      config: {},
      id: randomUUID(),
    };

    jest.mocked(makeRequest).mockResolvedValue({ status: 200 } as Response);

    const result = await hasEvalBeenShared(mockEval as Eval);
    expect(result).toBe(true);
  });

  it('returns false if the server returns 404', async () => {
    const mockEval: Partial<Eval> = {
      config: {},
      id: randomUUID(),
    };

    jest.mocked(makeRequest).mockResolvedValue({ status: 404 } as Response);

    const result = await hasEvalBeenShared(mockEval as Eval);
    expect(result).toBe(false);
  });
});

describe('trace sharing integration', () => {
  const mockTraceStore = {
    getTracesByEvaluation: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(require('../src/tracing/store').getTraceStore).mockReturnValue(mockTraceStore);
    mockFetch.mockReset();
    jest.requireMock('../src/envars').getEnvString.mockImplementation((_key: string) => '');
  });

  it('sends traces after successful eval sharing', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');

    const mockEval = buildMockEval();
    const mockTraces = [
      { id: 'trace-1', evalId: mockEval.id, data: 'trace data 1' },
      { id: 'trace-2', evalId: mockEval.id, data: 'trace data 2' },
    ];

    mockTraceStore.getTracesByEvaluation.mockResolvedValue(mockTraces);

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'remote-eval-id' }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    // Mock the traces send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createShareableUrl(mockEval as Eval);

    expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(mockEval.id);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.promptfoo.app/api/eval/results/remote-eval-id/traces',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(mockTraces),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('handles empty traces gracefully', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');

    const mockEval = buildMockEval();
    mockTraceStore.getTracesByEvaluation.mockResolvedValue([]);

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'remote-eval-id' }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createShareableUrl(mockEval as Eval);

    expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(mockEval.id);
    // Traces endpoint should not be called when there are no traces
    expect(mockFetch).toHaveBeenCalledTimes(2); // Only eval and results calls
  });

  it('handles trace sending failure gracefully without breaking share process', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');

    const mockEval = buildMockEval();
    const mockTraces = [{ id: 'trace-1', evalId: mockEval.id, data: 'trace data 1' }];

    mockTraceStore.getTracesByEvaluation.mockResolvedValue(mockTraces);

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'remote-eval-id' }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    // Mock the traces send failure
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: () => Promise.resolve('Server error'),
    });

    const result = await createShareableUrl(mockEval as Eval);

    expect(result).toContain('eval');
    expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(mockEval.id);
    expect(mockFetch).toHaveBeenCalledTimes(3); // All three calls made
  });

  it('handles trace store error gracefully', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');

    const mockEval = buildMockEval();
    mockTraceStore.getTracesByEvaluation.mockRejectedValue(new Error('Trace store error'));

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'remote-eval-id' }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await createShareableUrl(mockEval as Eval);

    expect(result).toContain('eval');
    expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(mockEval.id);
    // Traces endpoint should not be called due to error
    expect(mockFetch).toHaveBeenCalledTimes(2); // Only eval and results calls
  });

  it('sends traces with cloud config enabled', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');

    const mockEval = buildMockEval();
    const mockTraces = [{ id: 'trace-1', evalId: mockEval.id, data: 'trace data 1' }];

    mockTraceStore.getTracesByEvaluation.mockResolvedValue(mockTraces);

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'remote-eval-id' }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    // Mock the traces send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createShareableUrl(mockEval as Eval);

    expect(mockTraceStore.getTracesByEvaluation).toHaveBeenCalledWith(mockEval.id);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/results/remote-eval-id/traces',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(mockTraces),
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-api-key',
        }),
      }),
    );
  });

  it('constructs correct traces URL by replacing /results with /results/{remoteEvalId}/traces', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');

    const mockEval = buildMockEval();
    const mockTraces = [{ id: 'trace-1' }];

    mockTraceStore.getTracesByEvaluation.mockResolvedValue(mockTraces);

    // Mock the initial eval send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'remote-eval-123' }),
    });
    // Mock the chunk send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    // Mock the traces send
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createShareableUrl(mockEval as Eval);

    // Verify the URL construction
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.promptfoo.app/api/eval/results/remote-eval-123/traces',
      expect.any(Object),
    );
  });
});
