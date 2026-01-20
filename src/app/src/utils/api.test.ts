import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEvalAssertions, getApiBaseUrl, getAssertionJobStatus } from './api';

// Mock the store
vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: vi.fn(() => ({ apiBaseUrl: '' })),
  },
}));

import useApiConfig from '@app/stores/apiConfig';

// Helper to create mock state with only apiBaseUrl (other fields unused by getApiBaseUrl)
const mockState = (apiBaseUrl: string) =>
  ({
    apiBaseUrl,
    setApiBaseUrl: vi.fn(),
    fetchingPromise: null,
    setFetchingPromise: vi.fn(),
    persistApiBaseUrl: false,
    enablePersistApiBaseUrl: vi.fn(),
  }) as ReturnType<typeof useApiConfig.getState>;

// Mock fetch globally
global.fetch = vi.fn();

describe('getApiBaseUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty string when no apiBaseUrl configured', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
    // When no apiBaseUrl, returns VITE_PUBLIC_BASENAME (empty string in test build)
    expect(getApiBaseUrl()).toBe('');
  });

  it('returns apiBaseUrl when set', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));
    expect(getApiBaseUrl()).toBe('https://api.example.com');
  });

  it('removes trailing slash from apiBaseUrl', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com/'));
    expect(getApiBaseUrl()).toBe('https://api.example.com');
  });

  it('handles apiBaseUrl with path component', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://example.com/promptfoo'));
    expect(getApiBaseUrl()).toBe('https://example.com/promptfoo');
  });

  it('handles apiBaseUrl with path and trailing slash', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://example.com/promptfoo/'));
    expect(getApiBaseUrl()).toBe('https://example.com/promptfoo');
  });

  it('handles relative apiBaseUrl', () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('/custom-api'));
    expect(getApiBaseUrl()).toBe('/custom-api');
  });
});

describe('addEvalAssertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('sends POST request with correct payload for results scope', async () => {
    const mockResponseData = { jobId: 'job-123', total: 5 };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponseData),
    } as Response);

    const result = await addEvalAssertions('eval-123', {
      assertions: [{ type: 'contains', value: 'test' }],
      scope: { type: 'results', resultIds: ['result-1', 'result-2'] },
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/eval/eval-123/assertions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assertions: [{ type: 'contains', value: 'test' }],
        scope: { type: 'results', resultIds: ['result-1', 'result-2'] },
      }),
    });

    expect(result).toEqual(mockResponseData);
  });

  it('sends POST request with tests scope payload', async () => {
    const mockResponseData = { jobId: 'job-456', total: 10 };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponseData),
    } as Response);

    const result = await addEvalAssertions('eval-456', {
      assertions: [{ type: 'equals', value: 'expected' }],
      scope: { type: 'tests', testIndices: [0, 1, 2] },
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/eval/eval-456/assertions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assertions: [{ type: 'equals', value: 'expected' }],
        scope: { type: 'tests', testIndices: [0, 1, 2] },
      }),
    });

    expect(result).toEqual(mockResponseData);
  });

  it('sends POST request with filtered scope payload', async () => {
    const mockResponseData = { jobId: 'job-789', total: 15, matchedTestCount: 15 };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponseData),
    } as Response);

    const result = await addEvalAssertions('eval-789', {
      assertions: [{ type: 'icontains', value: 'error' }],
      scope: {
        type: 'filtered',
        filters: [{ type: 'assert', operator: 'eq', value: 'failed', logicOperator: 'and' }],
        filterMode: 'all',
        searchText: 'timeout',
      },
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.scope.type).toBe('filtered');
    expect(body.scope.filters).toHaveLength(1);
    expect(body.scope.searchText).toBe('timeout');

    expect(result).toEqual(mockResponseData);
  });

  it('handles multiple assertions in payload', async () => {
    const assertions = [
      { type: 'contains', value: 'success' },
      { type: 'is-json' },
      { type: 'llm-rubric', value: 'Evaluate response quality' },
    ];

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jobId: 'job-multi', total: 3 }),
    } as Response);

    await addEvalAssertions('eval-multi', {
      assertions,
      scope: { type: 'results', resultIds: ['result-1'] },
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);
    expect(body.assertions).toHaveLength(3);
    expect(body.assertions).toEqual(assertions);
  });

  it('throws error when response is not ok', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Internal server error'),
    } as Response);

    await expect(
      addEvalAssertions('eval-error', {
        assertions: [{ type: 'contains', value: 'test' }],
        scope: { type: 'results', resultIds: ['result-1'] },
      }),
    ).rejects.toThrow('Internal server error');
  });

  it('throws error with default message when response text is empty', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      text: () => Promise.resolve(''),
    } as Response);

    await expect(
      addEvalAssertions('eval-error', {
        assertions: [{ type: 'contains', value: 'test' }],
        scope: { type: 'results', resultIds: ['result-1'] },
      }),
    ).rejects.toThrow('Failed to add assertions');
  });

  it('handles immediate completion without job ID', async () => {
    const mockResponseData = {
      jobId: null,
      updatedResults: 2,
      skippedResults: 1,
      skippedAssertions: 0,
    };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponseData),
    } as Response);

    const result = await addEvalAssertions('eval-immediate', {
      assertions: [{ type: 'equals', value: 'test' }],
      scope: { type: 'results', resultIds: ['result-1', 'result-2', 'result-3'] },
    });

    expect(result).toEqual(mockResponseData);
  });
});

describe('getAssertionJobStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('sends GET request with correct URL', async () => {
    const mockStatus = {
      status: 'in-progress',
      progress: 5,
      total: 10,
      completedResults: [],
      updatedResults: 0,
      skippedResults: 0,
      skippedAssertions: 0,
      errors: [],
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockStatus }),
    } as Response);

    const result = await getAssertionJobStatus('eval-123', 'job-456');

    expect(global.fetch).toHaveBeenCalledWith('/api/eval/eval-123/assertions/job/job-456', {});
    expect(result).toEqual({ data: mockStatus });
  });

  it('returns complete status with results', async () => {
    const mockStatus = {
      status: 'complete',
      progress: 10,
      total: 10,
      completedResults: [
        { resultId: 'r1', pass: true, score: 1.0 },
        { resultId: 'r2', pass: false, score: 0.5 },
        { resultId: 'r3', pass: true, score: 0.9 },
      ],
      updatedResults: 10,
      skippedResults: 0,
      skippedAssertions: 0,
      errors: [],
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockStatus }),
    } as Response);

    const result = await getAssertionJobStatus('eval-complete', 'job-789');

    expect(result.data.status).toBe('complete');
    expect(result.data.completedResults).toHaveLength(3);
    expect(result.data.updatedResults).toBe(10);
  });

  it('returns status with errors', async () => {
    const mockStatus = {
      status: 'complete',
      progress: 5,
      total: 5,
      completedResults: [{ resultId: 'r1', pass: true, score: 1.0 }],
      updatedResults: 1,
      skippedResults: 0,
      skippedAssertions: 0,
      errors: [
        { resultId: 'r2', error: 'API timeout' },
        { resultId: 'r3', error: 'Rate limit exceeded' },
        { resultId: 'r4', error: 'API timeout' },
        { resultId: 'r5', error: 'Connection refused' },
      ],
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockStatus }),
    } as Response);

    const result = await getAssertionJobStatus('eval-errors', 'job-errors');

    expect(result.data.errors).toHaveLength(4);
    expect(result.data.errors[0]).toEqual({ resultId: 'r2', error: 'API timeout' });
  });

  it('returns error status', async () => {
    const mockStatus = {
      status: 'error',
      progress: 3,
      total: 10,
      completedResults: [],
      updatedResults: 0,
      skippedResults: 0,
      skippedAssertions: 0,
      errors: [{ resultId: 'r1', error: 'Job failed catastrophically' }],
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockStatus }),
    } as Response);

    const result = await getAssertionJobStatus('eval-fail', 'job-fail');

    expect(result.data.status).toBe('error');
  });

  it('throws error when response is not ok', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      text: () => Promise.resolve('Job not found'),
    } as Response);

    await expect(getAssertionJobStatus('eval-404', 'job-404')).rejects.toThrow('Job not found');
  });

  it('throws error with default message when response text is empty', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      text: () => Promise.resolve(''),
    } as Response);

    await expect(getAssertionJobStatus('eval-404', 'job-404')).rejects.toThrow(
      'Failed to get job status',
    );
  });

  it('handles in-progress status with partial results', async () => {
    const mockStatus = {
      status: 'in-progress',
      progress: 7,
      total: 15,
      completedResults: [
        { resultId: 'r1', pass: true, score: 1.0 },
        { resultId: 'r2', pass: true, score: 0.95 },
        { resultId: 'r3', pass: false, score: 0.3 },
      ],
      updatedResults: 2,
      skippedResults: 0,
      skippedAssertions: 0,
      errors: [{ resultId: 'r3', error: 'Assertion failed' }],
      matchedTestCount: 15,
    };

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockStatus }),
    } as Response);

    const result = await getAssertionJobStatus('eval-progress', 'job-progress');

    expect(result.data.status).toBe('in-progress');
    expect(result.data.progress).toBe(7);
    expect(result.data.total).toBe(15);
    expect(result.data.completedResults).toHaveLength(3);
    expect(result.data.matchedTestCount).toBe(15);
  });
});
