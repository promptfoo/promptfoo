import { mockBrowserProperty } from '@app/tests/browserMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addEvalAssertions,
  callApi,
  fetchUserEmail,
  fetchUserId,
  generateAssertionSuggestions,
  getApiBaseUrl,
  getAssertionJobStatus,
  updateEvalAuthor,
} from './api';

// Mock the store
vi.mock('@app/stores/apiConfig', () => ({
  default: {
    getState: vi.fn(() => ({ apiBaseUrl: '' })),
  },
}));

import useApiConfig from '@app/stores/apiConfig';

// Mock global fetch
const mockFetch = vi.fn();

beforeEach(() => {
  mockBrowserProperty(globalThis, 'fetch', mockFetch as typeof fetch);
});

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

describe('callApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  it('calls fetch with correct URL when apiBaseUrl is set', async () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));
    await callApi('/users');
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/api/users', {});
  });

  it('calls fetch with correct URL when apiBaseUrl is empty', async () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
    await callApi('/users');
    expect(mockFetch).toHaveBeenCalledWith('/api/users', {});
  });

  it('passes through RequestInit options', async () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    };
    await callApi('/users', options);
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/api/users', options);
  });

  it('returns the fetch response', async () => {
    const mockResponse = new Response(JSON.stringify({ id: '123' }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));

    const response = await callApi('/users');
    expect(response).toBe(mockResponse);
  });

  it('handles paths with leading slash', async () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));
    await callApi('/users/123');
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/api/users/123', {});
  });

  it('handles paths without leading slash', async () => {
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState('https://api.example.com'));
    await callApi('users/123');
    expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/apiusers/123', {});
  });
});

describe('fetchUserEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
    // Reset console.error mock
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns email when API call succeeds', async () => {
    const mockResponse = new Response(JSON.stringify({ email: 'test@example.com' }), {
      status: 200,
    });
    mockFetch.mockResolvedValue(mockResponse);

    const email = await fetchUserEmail();
    expect(email).toBe('test@example.com');
    expect(mockFetch).toHaveBeenCalledWith('/api/user/email', { method: 'GET' });
  });

  it('returns null when API returns non-ok response', async () => {
    const mockResponse = new Response('Not found', { status: 404 });
    mockFetch.mockResolvedValue(mockResponse);

    const email = await fetchUserEmail();
    expect(email).toBe(null);
    expect(console.error).toHaveBeenCalledWith('Error fetching user email:', expect.any(Error));
  });

  it('returns null when fetch throws error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const email = await fetchUserEmail();
    expect(email).toBe(null);
    expect(console.error).toHaveBeenCalledWith('Error fetching user email:', expect.any(Error));
  });

  it('returns null when JSON parsing fails', async () => {
    const mockResponse = new Response('invalid json', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const email = await fetchUserEmail();
    expect(email).toBe(null);
    expect(console.error).toHaveBeenCalled();
  });

  it('handles empty email string', async () => {
    const mockResponse = new Response(JSON.stringify({ email: '' }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const email = await fetchUserEmail();
    expect(email).toBe('');
  });
});

describe('fetchUserId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns user ID when API call succeeds', async () => {
    const mockResponse = new Response(JSON.stringify({ id: 'user-123' }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const userId = await fetchUserId();
    expect(userId).toBe('user-123');
    expect(mockFetch).toHaveBeenCalledWith('/api/user/id', { method: 'GET' });
  });

  it('returns null when API returns non-ok response', async () => {
    const mockResponse = new Response('Unauthorized', { status: 401 });
    mockFetch.mockResolvedValue(mockResponse);

    const userId = await fetchUserId();
    expect(userId).toBe(null);
    expect(console.error).toHaveBeenCalledWith('Error fetching user ID:', expect.any(Error));
  });

  it('returns null when fetch throws error', async () => {
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const userId = await fetchUserId();
    expect(userId).toBe(null);
    expect(console.error).toHaveBeenCalledWith('Error fetching user ID:', expect.any(Error));
  });

  it('returns null when JSON parsing fails', async () => {
    const mockResponse = new Response('not valid json', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const userId = await fetchUserId();
    expect(userId).toBe(null);
    expect(console.error).toHaveBeenCalled();
  });

  it('handles numeric user ID', async () => {
    const mockResponse = new Response(JSON.stringify({ id: '12345' }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const userId = await fetchUserId();
    expect(userId).toBe('12345');
  });
});

describe('updateEvalAuthor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('updates eval author successfully', async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const result = await updateEvalAuthor('eval-123', 'John Doe');
    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/eval/eval-123/author', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ author: 'John Doe' }),
    });
  });

  it('throws error when API returns non-ok response', async () => {
    const mockResponse = new Response('Server error', { status: 500 });
    mockFetch.mockResolvedValue(mockResponse);

    await expect(updateEvalAuthor('eval-123', 'Jane Doe')).rejects.toThrow(
      'Failed to update eval author',
    );
  });

  it('handles 404 response', async () => {
    const mockResponse = new Response('Not found', { status: 404 });
    mockFetch.mockResolvedValue(mockResponse);

    await expect(updateEvalAuthor('non-existent', 'Author')).rejects.toThrow(
      'Failed to update eval author',
    );
  });

  it('handles network error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(updateEvalAuthor('eval-123', 'Author')).rejects.toThrow('Network error');
  });

  it('handles empty author name', async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const result = await updateEvalAuthor('eval-123', '');
    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/eval/eval-123/author', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ author: '' }),
    });
  });

  it('handles special characters in author name', async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);
    const specialName = "O'Brien & Sons (Testing)";

    const result = await updateEvalAuthor('eval-123', specialName);
    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/eval/eval-123/author', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ author: specialName }),
    });
  });

  it('handles special characters in eval ID', async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const result = await updateEvalAuthor('eval-123-abc_def', 'Author');
    expect(result).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledWith('/api/eval/eval-123-abc_def/author', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ author: 'Author' }),
    });
  });
});

describe('addEvalAssertions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('sends POST request with results scope payload', async () => {
    const responseData = { success: true, data: { jobId: 'job-123', total: 2 } };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(responseData), { status: 200 }));

    const result = await addEvalAssertions('eval-123', {
      assertions: [{ type: 'contains', value: 'test' }],
      scope: { type: 'results', resultIds: ['result-1', 'result-2'] },
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/eval/eval-123/assertions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assertions: [{ type: 'contains', value: 'test' }],
        scope: { type: 'results', resultIds: ['result-1', 'result-2'] },
      }),
    });
    expect(result).toEqual(responseData);
  });

  it('sends filtered scope payload', async () => {
    const responseData = {
      success: true,
      data: { jobId: 'job-789', total: 15, matchedTestCount: 15 },
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(responseData), { status: 200 }));

    const result = await addEvalAssertions('eval-789', {
      assertions: [{ type: 'icontains', value: 'error' }],
      scope: {
        type: 'filtered',
        filters: [{ type: 'assert', operator: 'eq', value: 'failed', logicOperator: 'and' }],
        filterMode: 'all',
        searchText: 'timeout',
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body.scope).toMatchObject({
      type: 'filtered',
      filterMode: 'all',
      searchText: 'timeout',
    });
    expect(body.scope.filters).toHaveLength(1);
    expect(result).toEqual(responseData);
  });

  it('throws response text when assertion request fails', async () => {
    mockFetch.mockResolvedValue(new Response('Internal server error', { status: 500 }));

    await expect(
      addEvalAssertions('eval-error', {
        assertions: [{ type: 'contains', value: 'test' }],
        scope: { type: 'results', resultIds: ['result-1'] },
      }),
    ).rejects.toThrow('Internal server error');
  });

  it('throws a clean JSON error when assertion request fails with structured error body', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Another update is running' }), {
        status: 409,
      }),
    );

    await expect(
      addEvalAssertions('eval-error', {
        assertions: [{ type: 'contains', value: 'test' }],
        scope: { type: 'results', resultIds: ['result-1'] },
      }),
    ).rejects.toThrow('Another update is running');
  });
});

describe('getAssertionJobStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('sends GET request with correct URL', async () => {
    const responseData = {
      success: true,
      data: {
        status: 'in-progress',
        progress: 5,
        total: 10,
        completedResults: [],
        updatedResults: 0,
        skippedResults: 0,
        skippedAssertions: 0,
        errors: [],
      },
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(responseData), { status: 200 }));

    const result = await getAssertionJobStatus('eval-123', 'job-456');

    expect(mockFetch).toHaveBeenCalledWith('/api/eval/eval-123/assertions/job/job-456', {});
    expect(result).toEqual(responseData);
  });

  it('throws response text when job status request fails', async () => {
    mockFetch.mockResolvedValue(new Response('Job not found', { status: 404 }));

    await expect(getAssertionJobStatus('eval-123', 'missing-job')).rejects.toThrow('Job not found');
  });

  it('throws a clean JSON error when job status request fails with structured error body', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Job expired' }), { status: 404 }),
    );

    await expect(getAssertionJobStatus('eval-123', 'missing-job')).rejects.toThrow('Job expired');
  });
});

describe('generateAssertionSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiConfig.getState).mockReturnValue(mockState(''));
  });

  it('sends generation options to the assertion suggestion endpoint', async () => {
    const responseData = {
      success: true,
      data: {
        assertions: [{ type: 'llm-rubric', metric: 'quality', value: 'Check quality' }],
        context: {
          numPromptsAnalyzed: 1,
          numOutputsAnalyzed: 2,
          existingAssertionCount: 0,
        },
      },
    };
    mockFetch.mockResolvedValue(new Response(JSON.stringify(responseData), { status: 200 }));

    const result = await generateAssertionSuggestions('eval-123', {
      type: 'llm-rubric',
      numAssertions: 1,
      instructions: 'Focus on correctness',
      resultIds: ['result-1'],
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/eval/eval-123/assertions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'llm-rubric',
        numAssertions: 1,
        instructions: 'Focus on correctness',
        resultIds: ['result-1'],
      }),
    });
    expect(result).toEqual(responseData);
  });

  it('throws response text when suggestion generation fails', async () => {
    mockFetch.mockResolvedValue(new Response('Generation failed', { status: 500 }));

    await expect(generateAssertionSuggestions('eval-123')).rejects.toThrow('Generation failed');
  });

  it('throws a clean JSON error when suggestion generation fails with structured error body', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Result not found in eval' }), { status: 404 }),
    );

    await expect(generateAssertionSuggestions('eval-123')).rejects.toThrow(
      'Result not found in eval',
    );
  });
});
