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
import * as fetchModule from '../src/fetch';

import type EvalResult from 'src/models/evalResult';

import type Eval from '../src/models/eval';

function buildMockEval(): Partial<Eval> {
  return {
    config: {},
    prompts: [],
    author: 'test@example.com',
    useOldResults: jest.fn().mockReturnValue(false),
    loadResults: jest.fn().mockResolvedValue(undefined),
    results: [{ id: '1' }, { id: '2' }] as EvalResult[],
    save: jest.fn().mockResolvedValue(undefined),
    toEvaluateSummary: jest.fn().mockResolvedValue({}),
    getTable: jest.fn().mockResolvedValue([]),
    id: randomUUID(),
    getResultsCount: jest.fn().mockResolvedValue(2),
    fetchResultsBatched: jest.fn().mockImplementation((batchSize: number) => {
      let called = false;
      const iterator = {
        async next() {
          if (!called) {
            called = true;
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

jest.mock('../src/fetch');

jest.mock('../src/logger', () => {
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    __esModule: true,
    default: logger,
    isDebugEnabled: jest.fn().mockReturnValue(false),
  };
});

jest.mock('../src/globalConfig/cloud');

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
    mockFetch.mockReset();

    // Set up fetchWithProxy to use our mockFetch
    jest.spyOn(fetchModule, 'fetchWithProxy').mockImplementation(mockFetch);

    jest.requireMock('../src/envars').getEnvString.mockImplementation((_key: string) => '');
    jest.requireMock('../src/envars').isCI.mockReturnValue(true);
    jest.mocked(getUserEmail).mockReturnValue('test@example.com');
  });

  it('creates correct URL for cloud config and updates author', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    jest.mocked(getUserEmail).mockReturnValue('logged-in@example.com');

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });

    const mockEval = buildMockEval();
    mockEval.author = 'original@example.com';

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

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: newId }),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });

    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBe(`https://app.example.com/eval/${newId}`);

    // Set up mocks for second call - should return same ID for idempotency
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: newId }),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });

    // Verify idempotency
    const result2 = await createShareableUrl(mockEval as Eval);
    expect(result2).toEqual(result);
  });

  it('Self-Hosted: creates unique URL for each share call', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    const originalId = randomUUID();
    const newId = randomUUID();
    const newId2 = randomUUID();
    const mockEval = buildMockEval();
    mockEval.id = originalId;

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: newId }),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: newId2 }),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });

    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBe(`https://promptfoo.app/eval/${newId}`);

    const result2 = await createShareableUrl(mockEval as Eval);
    expect(result2).toBe(`https://promptfoo.app/eval/${newId2}`);
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
            text: () => Promise.resolve(''),
          });
        })
        .mockImplementationOnce((url, options) => {
          // Chunk of results
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
            text: () => Promise.resolve(''),
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

      const serverAssignedId = 'server-assigned-id';

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: serverAssignedId }),
          text: () => Promise.resolve(''),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
          text: () => Promise.resolve(''),
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
        expect.stringMatching(`/api/eval/${serverAssignedId}/results`),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[{"id":"1"},{"id":"2"}]'),
        }),
      );
      expect(result).toBe(`https://promptfoo.app/eval/${serverAssignedId}`);
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
    const serverAssignedId = 'server-assigned-id';

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: serverAssignedId }),
        text: () => Promise.resolve(''),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
      });

    const result = await createShareableUrl(mockEval as Eval);

    expect(result).toBe(`${customDomain}/eval/?evalId=${serverAssignedId}`);
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
