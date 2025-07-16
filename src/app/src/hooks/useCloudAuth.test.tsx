import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudAuth } from './useCloudAuth';
import { act } from '@testing-library/react';

// Mock the API module
vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

import { callApi } from '@app/utils/api';

describe('useCloudAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return authenticated status when API returns authenticated', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          isAuthenticated: true,
          hasApiKey: true,
          appUrl: 'https://app.promptfoo.app',
          isEnterprise: false,
        }),
    } as Response);

    const { result } = renderHook(() => useCloudAuth());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.hasApiKey).toBe(true);
    expect(result.current.appUrl).toBe('https://app.promptfoo.app');
    expect(result.current.isEnterprise).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should return unauthenticated status when API returns not authenticated', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          isAuthenticated: false,
          hasApiKey: false,
          appUrl: null,
          isEnterprise: false,
        }),
    } as Response);

    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.hasApiKey).toBe(false);
    expect(result.current.appUrl).toBeNull();
    expect(result.current.isEnterprise).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle API errors', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('Failed to check cloud status');
  });

  it('should handle network errors', async () => {
    vi.mocked(callApi).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('Network error');
  });

  it('should support refetching', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          isAuthenticated: false,
          hasApiKey: false,
          appUrl: null,
          isEnterprise: false,
        }),
    } as Response);

    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);

    // Mock authenticated response for refetch
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          isAuthenticated: true,
          hasApiKey: true,
          appUrl: 'https://app.promptfoo.app',
          isEnterprise: false,
        }),
    } as Response);

    // Trigger refetch
    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });
  });

  it('should detect enterprise deployment', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          isAuthenticated: true,
          hasApiKey: true,
          appUrl: 'https://enterprise.company.com',
          isEnterprise: true,
        }),
    } as Response);

    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isEnterprise).toBe(true);
    expect(result.current.appUrl).toBe('https://enterprise.company.com');
  });
});
