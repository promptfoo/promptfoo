import { randomUUID } from 'node:crypto';
import type EvalResult from 'src/models/evalResult';
import { getUserEmail } from '../src/globalConfig/accounts';
import { cloudConfig } from '../src/globalConfig/cloud';
import type Eval from '../src/models/eval';
import {
  stripAuthFromUrl,
  createShareableUrl,
  determineShareDomain,
  isSharingEnabled,
  hasEvalBeenShared,
} from '../src/share';
import { cloudCanAcceptChunkedResults, makeRequest } from '../src/util/cloud';

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
  cloudCanAcceptChunkedResults: jest.fn(),
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
    SHARE_API_BASE_URL: 'https://api.promptfoo.app',
    DEFAULT_SHARE_VIEW_BASE_URL: 'https://promptfoo.app',
    SHARE_VIEW_BASE_URL: 'https://promptfoo.app',
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
    // Reset cloudConfig mock
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    // Reset constants mock
    const constants = jest.requireMock('../src/constants');
    constants.SHARE_API_BASE_URL = 'https://api.promptfoo.app';
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
    // Set custom API URL
    const constants = jest.requireMock('../src/constants');
    constants.SHARE_API_BASE_URL = 'https://custom-api.example.com';

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
    // Mock SHARE_API_BASE_URL to default value
    jest.mock('../src/constants', () => ({
      ...jest.requireActual('../src/constants'),
      SHARE_API_BASE_URL: 'https://api.promptfoo.app',
    }));

    const mockEval: Partial<Eval> = {
      config: {},
    };

    expect(isSharingEnabled(mockEval as Eval)).toBe(false);
  });

  it('returns false when sharing config is not an object', () => {
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
    // Reset the mock to return empty string for all environment variables
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
    // Reset the mock to return empty string for all environment variables
    jest.requireMock('../src/envars').getEnvString.mockImplementation((_key: string) => '');
    // Setup default successful response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'mock-eval-id' }),
    });
  });

  it('creates correct URL for cloud config and updates author', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    jest.mocked(getUserEmail).mockReturnValue('logged-in@example.com');

    const mockEval: Partial<Eval> = {
      config: {},
      author: 'original@example.com',
      useOldResults: jest.fn().mockReturnValue(false),
      loadResults: jest.fn().mockResolvedValue(undefined),
      results: [{ id: '1' }, { id: '2' }] as EvalResult[],
      save: jest.fn().mockResolvedValue(undefined),
      toEvaluateSummary: jest.fn().mockResolvedValue({}),
      getTable: jest.fn().mockResolvedValue([]),
      id: randomUUID(),
    };

    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBe(`https://app.example.com/eval/${mockEval.id}`);
  });

  describe('chunked vs regular sending', () => {
    let mockEval: Partial<Eval>;

    beforeEach(() => {
      mockEval = {
        config: {},
        author: 'test@example.com',
        useOldResults: jest.fn().mockReturnValue(false),
        loadResults: jest.fn().mockResolvedValue(undefined),
        results: [{ id: '1' }, { id: '2' }] as EvalResult[],
        save: jest.fn().mockResolvedValue(undefined),
        toEvaluateSummary: jest.fn().mockResolvedValue({}),
        getTable: jest.fn().mockResolvedValue([]),
        id: randomUUID(),
      };

      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      // Reset the environment variable mock
      jest.requireMock('../src/envars').getEnvString.mockImplementation((_key: string) => '');

      // Reset fetch mock between tests
      mockFetch.mockReset();
    });

    it('sends regular eval when cloud build date is older than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudCanAcceptChunkedResults).mockResolvedValue(false);

      // Mock successful response
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'mock-eval-id' }),
      });

      await createShareableUrl(mockEval as Eval);

      // Verify sendEvalResults was used (not chunked)
      expect(mockEval.loadResults).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[{"id":"1"},{"id":"2"}]'),
        }),
      );
    });

    it('sends chunked eval when cloud build date is newer than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudCanAcceptChunkedResults).mockResolvedValue(true);

      // Mock successful responses for initial request and chunk
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'mock-eval-id' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      await createShareableUrl(mockEval as Eval);

      // Verify chunks were sent
      expect(mockEval.loadResults).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[]'),
        }),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/results/mock-eval-id/results',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('[{"id":"1"},{"id":"2"}]'),
        }),
      );
    });

    it('sends regular eval when open source version is older than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

      // Mock both the health check and eval submission responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.7' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.7' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockEval.id }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const result = await createShareableUrl(mockEval as Eval);

      // Verify sendEvalResults was used (not chunked)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/eval'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"results":[{"id":"1"},{"id":"2"}]'),
        }),
      );
      expect(result).toBe(`https://promptfoo.app/eval/${mockEval.id}`);
    });

    it('sends chunked eval when open source version is newer than supported', async () => {
      jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

      // Mock health check, initial eval submission, and chunk submission responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.9' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ version: '0.103.9' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockEval.id }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const result = await createShareableUrl(mockEval as Eval);

      // Verify chunks were sent
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

  // Add test for custom domain
  it('creates URL with custom domain from environment variables', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(false);

    const customDomain = 'https://my-custom-instance.com';
    jest.requireMock('../src/envars').getEnvString.mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_REMOTE_APP_BASE_URL') {
        return customDomain;
      }
      return '';
    });

    const mockEval: Partial<Eval> = {
      config: {},
      author: 'test@example.com',
      useOldResults: jest.fn().mockReturnValue(false),
      loadResults: jest.fn().mockResolvedValue(undefined),
      results: [{ id: '1' }, { id: '2' }] as EvalResult[],
      save: jest.fn().mockResolvedValue(undefined),
      toEvaluateSummary: jest.fn().mockResolvedValue({}),
      getTable: jest.fn().mockResolvedValue([]),
      id: randomUUID(),
    };

    // Mock the health check and response
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '0.103.7' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ version: '0.103.7' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: mockEval.id }),
      });

    const result = await createShareableUrl(mockEval as Eval);

    // Verify the URL uses the custom domain
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
