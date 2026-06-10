import { randomUUID } from 'node:crypto';

import { inArray } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../src/blobs';
import { createRemoteBlobUploadCache, uploadBlobRefsForShare } from '../src/blobs/shareUpload';
import * as constants from '../src/constants';
import { getDb } from '../src/database';
import { blobAssetsTable, blobReferencesTable, evalsTable } from '../src/database/tables';
import * as envars from '../src/envars';
import { getUserEmail } from '../src/globalConfig/accounts';
import { cloudConfig } from '../src/globalConfig/cloud';
import { runDbMigrations } from '../src/migrate';
import {
  createShareableModelAuditUrl,
  createShareableUrl,
  determineShareDomain,
  hasEvalBeenShared,
  hasModelAuditBeenShared,
  isSharingEnabled,
  stripAuthFromUrl,
} from '../src/share';
import { makeRequest } from '../src/util/cloud';
import { inlineBlobRefsForShare } from '../src/util/inlineBlobsForShare';

import type { BlobStorageProvider } from '../src/blobs';
import type Eval from '../src/models/eval';
import type EvalResult from '../src/models/evalResult';
import type ModelAudit from '../src/models/modelAudit';

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
const originalIsTTY = process.stdout.isTTY;

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
vi.mock('../src/blobs/shareUpload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/blobs/shareUpload')>();
  return {
    ...actual,
    createRemoteBlobUploadCache: vi.fn(),
    uploadBlobRefsForShare: vi.fn(),
  };
});
vi.mock('../src/util/inlineBlobsForShare', () => ({
  createBlobInlineCache: vi.fn(() => new Map()),
  inlineBlobRefsForShare: vi.fn(async (value: unknown) => value),
}));
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

afterEach(() => {
  vi.resetAllMocks();
  process.stdout.isTTY = originalIsTTY;
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
    vi.mocked(constants.getDefaultShareViewBaseUrl).mockReturnValue('https://promptfoo.app');
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

describe('model audit sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(envars.getEnvBool).mockReset();
    vi.mocked(cloudConfig.isEnabled).mockReset();
    vi.mocked(cloudConfig.getApiHost).mockReset();
    vi.mocked(cloudConfig.getAppUrl).mockReset();
    vi.mocked(cloudConfig.getApiKey).mockReset();
    vi.mocked(cloudConfig.getCurrentOrganizationId).mockReset();
    vi.mocked(cloudConfig.getCurrentTeamId).mockReset();
    vi.mocked(envars.getEnvBool).mockReturnValue(false);
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    vi.mocked(cloudConfig.getCurrentOrganizationId).mockReturnValue('org-123');
    vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue('team-456');
  });

  const mockAudit = {
    id: 'scan-123',
    createdAt: 1,
    updatedAt: 2,
    name: 'Audit',
    author: 'test@example.com',
    modelPath: '/tmp/model.pkl',
    modelType: null,
    results: {},
    checks: [],
    issues: [],
    hasErrors: false,
    totalChecks: 1,
    passedChecks: 1,
    failedChecks: 0,
    metadata: {},
    modelId: 'owner/model',
    revisionSha: 'abc123',
    contentHash: 'sha256:def456',
    modelSource: 'huggingface',
    sourceLastModified: 123,
    scannerVersion: '0.2.30',
  } as unknown as ModelAudit;

  it('does not upload when sharing is disabled', async () => {
    vi.mocked(envars.getEnvBool).mockImplementation((key) => key === 'PROMPTFOO_DISABLE_SHARING');

    const result = await createShareableModelAuditUrl(mockAudit);

    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('includes selected team context in share uploads', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'scan-123' }),
    });

    const result = await createShareableModelAuditUrl(mockAudit);

    expect(result).toBe('https://app.example.com/model-audit/scan-123');
    const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(requestBody.teamId).toBe('team-456');
  });

  it('scopes prior-share lookup to the selected team', async () => {
    vi.mocked(makeRequest).mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await hasModelAuditBeenShared(mockAudit);

    expect(result).toBe(true);
    expect(makeRequest).toHaveBeenCalledWith('model-audits/scan-123?teamId=team-456', 'GET');
  });
});

describe('createShareableUrl', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(envars.getEnvString).mockImplementation((_key: string) => '');
    vi.mocked(envars.isCI).mockReturnValue(false);
    vi.mocked(envars.getEnvBool).mockReturnValue(false);
    vi.mocked(constants.getShareApiBaseUrl).mockReturnValue('https://api.promptfoo.app');
    vi.mocked(constants.getDefaultShareViewBaseUrl).mockReturnValue('https://promptfoo.app');
    vi.mocked(constants.getShareViewBaseUrl).mockReturnValue('https://promptfoo.app');
    vi.mocked(createRemoteBlobUploadCache).mockReturnValue(new Map());
    vi.mocked(uploadBlobRefsForShare).mockResolvedValue(undefined);
    mockFetch.mockReset();
    // Mock process.stdout.isTTY
    process.stdout.isTTY = false;
  });

  it('does not initialize remote blob uploads when sharing is globally disabled', async () => {
    vi.mocked(envars.getEnvBool).mockImplementation((key) => key === 'PROMPTFOO_DISABLE_SHARING');

    await expect(createShareableUrl(buildMockEval() as Eval)).resolves.toBeNull();

    expect(createRemoteBlobUploadCache).not.toHaveBeenCalled();
    expect(uploadBlobRefsForShare).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
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
    expect(mockEval.useOldResults).toHaveBeenCalled();
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

  it('skips email collection when author is already set', async () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    process.stdout.isTTY = true;
    vi.mocked(envars.isCI).mockReturnValue(false);
    vi.mocked(envars.getEnvBool).mockReturnValue(false);

    const mockEval = buildMockEval();
    mockEval.author = 'preset-author@example.com';

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

    await createShareableUrl(mockEval as Eval);

    // getUserEmail should not have been called since author was already set
    expect(getUserEmail).not.toHaveBeenCalled();
    // The author should remain unchanged
    expect(mockEval.author).toBe('preset-author@example.com');
  });

  it('still backfills author from stored email when author is null in a TTY', async () => {
    vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
    process.stdout.isTTY = true;
    vi.mocked(envars.isCI).mockReturnValue(false);
    vi.mocked(envars.getEnvBool).mockReturnValue(false);
    vi.mocked(getUserEmail).mockReturnValue('stored@example.com');

    const mockEval = buildMockEval();
    mockEval.author = null as any;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: mockEval.id }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    await createShareableUrl(mockEval as Eval);

    // getUserEmail must have been consulted since no author was set.
    expect(getUserEmail).toHaveBeenCalled();
    expect(mockEval.author).toBe('stored@example.com');
    expect(mockEval.save).toHaveBeenCalled();
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

    it('uploads local blob refs before manually sharing a previously unshared eval', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

      const hash = 'a'.repeat(64);
      const result = {
        id: 'result-1',
        promptIdx: 2,
        response: { output: `promptfoo://blob/${hash}` },
        testIdx: 1,
      } as EvalResult;
      mockEval.config = { sharing: false };
      mockEval.fetchResultsBatched = vi.fn().mockImplementation(() => {
        const iterator = {
          called: false,
          next: async () => {
            if (!iterator.called) {
              iterator.called = true;
              return { done: false, value: [result] };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
        return iterator;
      });
      mockEval.getTotalResultRowCount = vi.fn().mockResolvedValue(1);

      let releaseUpload: (() => void) | undefined;
      const uploadGate = new Promise<void>((resolve) => {
        releaseUpload = resolve;
      });
      let markUploadStarted: (() => void) | undefined;
      const uploadStarted = new Promise<void>((resolve) => {
        markUploadStarted = resolve;
      });
      vi.mocked(uploadBlobRefsForShare).mockImplementation(async () => {
        markUploadStarted?.();
        await uploadGate;
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'manual-share-id' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const sharePromise = createShareableUrl(mockEval as Eval);
      await uploadStarted;

      expect(mockFetch).toHaveBeenCalledTimes(1);
      releaseUpload?.();

      await expect(sharePromise).resolves.toBe('https://app.example.com/eval/manual-share-id');
      expect(uploadBlobRefsForShare).toHaveBeenCalledWith(
        result,
        expect.any(Map),
        {
          localEvalId: mockEval.id,
          promptIdx: 2,
          remoteEvalId: 'manual-share-id',
          testIdx: 1,
        },
        undefined,
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
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

    it('shares without traces when an older self-hosted server lacks the trace endpoint', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      mockEval.getTraces = vi.fn().mockResolvedValue([
        {
          traceId: 'trace-from-newer-client',
          evaluationId: mockEval.id as string,
          testCaseId: 'test-case-1',
          metadata: {},
          spans: [],
        },
      ]);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockEval.id }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve(`Cannot POST /api/eval/${mockEval.id}/traces`),
        });

      const result = await createShareableUrl(mockEval as Eval, { silent: true });

      expect(result).toBe(`https://promptfoo.app/eval/${mockEval.id}`);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[2][0]).toMatch(new RegExp(`/api/eval/${mockEval.id}/traces$`));
      expect(mockFetch.mock.calls.every(([, options]) => options.method !== 'DELETE')).toBe(true);
    });

    it('still rolls back when the trace endpoint reports that the new eval is missing', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      mockEval.getTraces = vi.fn().mockResolvedValue([
        {
          traceId: 'trace-for-missing-eval',
          evaluationId: mockEval.id as string,
          testCaseId: 'test-case-1',
          metadata: {},
          spans: [],
        },
      ]);

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockEval.id }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: () => Promise.resolve('{"error":"Eval not found"}'),
        })
        .mockResolvedValueOnce({ ok: true });

      const result = await createShareableUrl(mockEval as Eval, { silent: true });

      expect(result).toBeNull();
      expect(mockFetch.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(true);
    });

    it('inlines authorized result blobs and separately transfers authorized trace blobs', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      vi.mocked(envars.getEnvBool).mockImplementation((_key, defaultValue) =>
        Boolean(defaultValue),
      );

      const actualInlineModule = await vi.importActual<
        typeof import('../src/util/inlineBlobsForShare')
      >('../src/util/inlineBlobsForShare');
      vi.mocked(inlineBlobRefsForShare).mockImplementation(
        actualInlineModule.inlineBlobRefsForShare,
      );

      const authorizedHash = '1'.repeat(64);
      const copiedHash = '2'.repeat(64);
      const resultHash = '6'.repeat(64);
      const authorizedUri = `promptfoo://blob/${authorizedHash}`;
      const copiedUri = `promptfoo://blob/${copiedHash}`;
      const resultUri = `promptfoo://blob/${resultHash}`;
      const authorizedBytes = Buffer.from('authorized-trace-bytes');
      const copiedBytes = Buffer.from('sensitive-other-eval-bytes');
      const resultBytes = Buffer.from('authorized-result-bytes');
      const bytesByHash: Record<string, Buffer> = {
        [authorizedHash]: authorizedBytes,
        [copiedHash]: copiedBytes,
        [resultHash]: resultBytes,
      };
      const otherEvalId = `eval-${randomUUID()}`;
      const remoteEvalId = 'shared-eval-id';
      mockEval.config = { sharing: { apiBaseUrl: 'https://self-hosted.example/promptfoo' } };
      const resultRow = {
        id: 'result-1',
        evaluationId: mockEval.id,
        promptIdx: 0,
        response: { output: `${resultUri} ${copiedUri}` },
        testIdx: 0,
        traceId: 'trace-with-media',
      } as EvalResult;

      mockEval.fetchResultsBatched = vi.fn().mockImplementation(() => {
        const iterator = {
          called: false,
          next: async () => {
            if (!iterator.called) {
              iterator.called = true;
              return { done: false, value: [resultRow] };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
        return iterator;
      });
      mockEval.getTotalResultRowCount = vi.fn().mockResolvedValue(1);
      mockEval.getTraces = vi.fn().mockResolvedValue([
        {
          traceId: 'trace-with-media',
          evaluationId: mockEval.id as string,
          testCaseId: 'test-case-1',
          metadata: { image: authorizedUri, promptIdx: 0, testIdx: 0 },
          spans: [],
        },
      ]);

      const getByHash = vi.fn<BlobStorageProvider['getByHash']>(async (hash) => ({
        data: bytesByHash[hash],
        metadata: {
          createdAt: '2026-06-10T00:00:00.000Z',
          key: hash,
          mimeType: 'image/png',
          provider: 'test-stub',
          sizeBytes: bytesByHash[hash].length,
        },
      }));
      setBlobStorageProvider({
        providerId: 'test-stub',
        store: async () => {
          throw new Error('not implemented');
        },
        getByHash,
        exists: async () => true,
        deleteByHash: async () => {},
        getUrl: async () => null,
      });

      const db = await getDb();
      await db.insert(evalsTable).values([
        { id: mockEval.id as string, config: {}, results: {} },
        { id: otherEvalId, config: {}, results: {} },
      ]);
      await db.insert(blobAssetsTable).values(
        Object.entries(bytesByHash).map(([hash, bytes]) => ({
          hash,
          mimeType: 'image/png',
          provider: 'test-stub',
          sizeBytes: bytes.length,
        })),
      );
      await db.insert(blobReferencesTable).values([
        {
          id: randomUUID(),
          blobHash: authorizedHash,
          evalId: mockEval.id as string,
          kind: 'image',
          location: 'trace.metadata',
        },
        {
          id: randomUUID(),
          blobHash: copiedHash,
          evalId: otherEvalId,
          kind: 'image',
          location: 'response.output',
        },
        {
          id: randomUUID(),
          blobHash: resultHash,
          evalId: mockEval.id as string,
          kind: 'image',
          location: 'response.output',
        },
      ]);

      vi.mocked(uploadBlobRefsForShare).mockImplementation(
        async (_value, _cache, context, uploader) => {
          await uploader?.(authorizedBytes, 'image/png', {
            evalId: context.remoteEvalId,
            kind: 'image',
            location: 'share',
            promptIdx: context.promptIdx,
            testIdx: context.testIdx,
          });
        },
      );

      try {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ id: remoteEvalId }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({}),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () =>
              Promise.resolve({
                deduplicated: false,
                ref: {
                  hash: authorizedHash,
                  mimeType: 'image/png',
                  provider: 'filesystem',
                  sizeBytes: authorizedBytes.length,
                  uri: authorizedUri,
                },
              }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({}),
          });

        const result = await createShareableUrl(mockEval as Eval, { silent: true });

        expect(result).toBe(`https://promptfoo.app/eval/${remoteEvalId}`);
        const initialBody = JSON.parse(mockFetch.mock.calls[0][1].body);
        const chunkBody = JSON.parse(mockFetch.mock.calls[1][1].body);
        const blobBody = JSON.parse(mockFetch.mock.calls[2][1].body);
        const traceBody = JSON.parse(mockFetch.mock.calls[3][1].body);
        expect(initialBody.traces).toEqual([]);
        // Positive control for the results path: the same-eval blob is inlined while the
        // copied cross-eval URI in the same string is left untouched.
        expect(chunkBody[0].response.output).toBe(
          `data:image/png;base64,${resultBytes.toString('base64')} ${copiedUri}`,
        );
        expect(chunkBody[0].traceId).not.toBe('trace-with-media');
        expect(chunkBody[0].evaluationId).toBe(remoteEvalId);
        expect(traceBody[0]).toMatchObject({
          evaluationId: remoteEvalId,
          testCaseId: 'test-case-1',
          metadata: { image: authorizedUri, promptIdx: 0, testIdx: 0 },
        });
        expect(traceBody[0].traceId).toBe(chunkBody[0].traceId);
        expect(mockFetch.mock.calls[2][0]).toBe('https://self-hosted.example/promptfoo/api/blobs');
        expect(blobBody.data).toBe(authorizedBytes.toString('base64'));
        expect(blobBody.context.promptIdx).toBe(0);
        expect(blobBody.context.testIdx).toBe(0);
        expect(mockFetch.mock.calls[3][0]).toMatch(new RegExp(`/api/eval/${remoteEvalId}/traces$`));
        expect(mockFetch.mock.calls[0][1].body).not.toContain(authorizedBytes.toString('base64'));
        expect(mockFetch.mock.calls[1][1].body).not.toContain(authorizedBytes.toString('base64'));
        expect(mockFetch.mock.calls[3][1].body).not.toContain(authorizedBytes.toString('base64'));
        expect(mockFetch.mock.calls.map(([, options]) => options.body).join('\n')).not.toContain(
          copiedBytes.toString('base64'),
        );
        expect(getByHash).toHaveBeenCalledTimes(1);
        expect(getByHash).toHaveBeenCalledWith(resultHash);
        expect(uploadBlobRefsForShare).toHaveBeenCalledOnce();
        expect(uploadBlobRefsForShare).toHaveBeenCalledWith(
          expect.objectContaining({ traceId: 'trace-with-media' }),
          expect.any(Map),
          {
            localEvalId: mockEval.id,
            promptIdx: 0,
            remoteEvalId,
            testIdx: 0,
          },
          expect.any(Function),
        );
      } finally {
        resetBlobStorageProvider();
        await db
          .delete(blobReferencesTable)
          .where(inArray(blobReferencesTable.evalId, [mockEval.id as string, otherEvalId]));
        await db
          .delete(blobAssetsTable)
          .where(inArray(blobAssetsTable.hash, Object.keys(bytesByHash)));
        await db
          .delete(evalsTable)
          .where(inArray(evalsTable.id, [mockEval.id as string, otherEvalId]));
      }
    });

    it('redacts Azure Blob SAS tokens from the shared eval config', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      mockEval.config = {
        tests: 'az://account/container/tests.yaml?sp=r&sig=azure-secret',
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockEval.id }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      await createShareableUrl(mockEval as Eval);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.config.tests).toBe(
        'az://account/container/tests.yaml?sp=r&sig=%5BREDACTED%5D',
      );
      expect(mockFetch.mock.calls[0][1].body).not.toContain('azure-secret');
    });

    it('includes eval tags in the shared config payload', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(false);
      mockEval.config = {
        tags: {
          'ci.run-id': '123',
          'git.sha': 'abc123',
        },
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: mockEval.id }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      await createShareableUrl(mockEval as Eval);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.config.tags).toEqual({
        'ci.run-id': '123',
        'git.sha': 'abc123',
      });
    });

    it('sends eval with trace data when traces are available', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);

      const mockEvalWithTraces = buildMockEval();
      const hash = '3'.repeat(64);
      const blobUri = `promptfoo://blob/${hash}`;
      const resultRow = {
        id: 'result-with-trace-media',
        promptIdx: 2,
        response: { output: blobUri },
        testIdx: 1,
      } as EvalResult;
      const mockTraces = [
        {
          traceId: 'trace-123',
          evaluationId: mockEvalWithTraces.id as string,
          testCaseId: 'test-case-1',
          metadata: { media: blobUri, promptIdx: 2, test: 'metadata', testIdx: 1 },
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
      mockEvalWithTraces.getTotalResultRowCount = vi.fn().mockResolvedValue(1);
      mockEvalWithTraces.fetchResultsBatched = vi.fn().mockImplementation(() => {
        const iterator = {
          called: false,
          next: async () => {
            if (!iterator.called) {
              iterator.called = true;
              return { done: false, value: [resultRow] };
            }
            return { done: true, value: undefined };
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };
        return iterator;
      });

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
        metadata: { media: blobUri, promptIdx: 2, test: 'metadata', testIdx: 1 },
      });
      expect(requestBody.traces[0].spans).toHaveLength(1);
      expect(requestBody.traces[0].spans[0]).toMatchObject({
        spanId: 'span-1',
        name: 'Test Span',
        startTime: 1000,
        endTime: 2000,
        statusCode: 1,
      });
      expect(uploadBlobRefsForShare).toHaveBeenNthCalledWith(
        1,
        resultRow,
        expect.any(Map),
        {
          localEvalId: mockEvalWithTraces.id,
          promptIdx: 2,
          remoteEvalId: 'mock-eval-id',
          testIdx: 1,
        },
        undefined,
      );
      expect(uploadBlobRefsForShare).toHaveBeenNthCalledWith(
        2,
        mockTraces[0],
        expect.any(Map),
        {
          localEvalId: mockEvalWithTraces.id,
          promptIdx: 2,
          remoteEvalId: 'mock-eval-id',
          testIdx: 1,
        },
        undefined,
      );
      // Result coordinates win for blobs in both places only if the result and trace
      // uploads dedupe through one shared cache, so pin the single construction and the
      // cache identity across both calls.
      expect(uploadBlobRefsForShare).toHaveBeenCalledTimes(2);
      expect(createRemoteBlobUploadCache).toHaveBeenCalledTimes(1);
      const uploadCalls = vi.mocked(uploadBlobRefsForShare).mock.calls;
      expect(uploadCalls[0][1]).toBe(uploadCalls[1][1]);
    });

    it('uploads Cloud trace blobs when result blobs use the inline override', async () => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue(undefined);
      vi.mocked(envars.getEnvBool).mockImplementation((key, defaultValue) =>
        key === 'PROMPTFOO_SHARE_INLINE_BLOBS' ? true : Boolean(defaultValue),
      );

      const hash = '4'.repeat(64);
      const blobUri = `promptfoo://blob/${hash}`;
      const mockEvalWithTraces = buildMockEval();
      const resultRow = {
        id: 'result-inline-override',
        promptIdx: 4,
        response: { output: blobUri },
        testIdx: 3,
      } as EvalResult;
      const traces = [
        {
          traceId: 'trace-inline-override',
          evaluationId: mockEvalWithTraces.id as string,
          metadata: { media: blobUri },
          spans: [],
        },
      ];
      mockEvalWithTraces.getTraces = vi.fn().mockResolvedValue(traces);
      mockEvalWithTraces.getTotalResultRowCount = vi.fn().mockResolvedValue(1);
      mockEvalWithTraces.fetchResultsBatched = vi.fn().mockImplementation(async function* () {
        yield [resultRow];
      });

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'mock-eval-id' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      await createShareableUrl(mockEvalWithTraces as Eval, { silent: true });

      const initialBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(initialBody.traces[0].metadata.media).toBe(blobUri);
      expect(inlineBlobRefsForShare).toHaveBeenCalled();
      expect(uploadBlobRefsForShare).toHaveBeenNthCalledWith(
        1,
        resultRow,
        expect.any(Map),
        {
          localEvalId: mockEvalWithTraces.id,
          promptIdx: 4,
          remoteEvalId: 'mock-eval-id',
          testIdx: 3,
        },
        undefined,
      );
      expect(uploadBlobRefsForShare).toHaveBeenNthCalledWith(
        2,
        traces[0],
        expect.any(Map),
        {
          localEvalId: mockEvalWithTraces.id,
          promptIdx: undefined,
          remoteEvalId: 'mock-eval-id',
          testIdx: undefined,
        },
        undefined,
      );
      expect(uploadBlobRefsForShare).toHaveBeenCalledTimes(2);
      const uploadCalls = vi.mocked(uploadBlobRefsForShare).mock.calls;
      expect(uploadCalls[0][1]).toBe(uploadCalls[1][1]);
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

      const result = await createShareableUrl(mockEvalTracesError as Eval);

      // Should return null when an error occurs
      expect(result).toBeNull();
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

    // Should return null (rollback is attempted)
    const result = await createShareableUrl(mockEval as Eval);
    expect(result).toBeNull();
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

    const result = await createShareableUrl(mockEval as Eval);

    // Should fail without retrying (unknown error type)
    expect(result).toBeNull();
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
