import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudAuth } from './useCloudAuth';
import { useState } from 'react';
import { act } from '@testing-library/react';

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

  it('should initialize with correct loading state', () => {
    const { result } = renderHook(() => useCloudAuth());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.hasApiKey).toBe(false);
    expect(result.current.appUrl).toBeNull();
    expect(result.current.isEnterprise).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should only call the API once on initialization despite re-renders', async () => {
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

    let _renderCount = 0;

    const { result, rerender } = renderHook(() => {
      _renderCount++;
      return useCloudAuth();
    });

    expect(vi.mocked(callApi).mock.calls.length).toBe(1);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    rerender();
    rerender();
    rerender();

    expect(vi.mocked(callApi).mock.calls.length).toBe(1);
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

  it('should handle invalid JSON responses', async () => {
    vi.mocked(callApi).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON at position 0')),
    } as Response);

    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.error).toBe('Unexpected token < in JSON at position 0');
  });

  it('should reset error to null and set isLoading to true when refetch is called after a previous error', async () => {
    vi.mocked(callApi).mockRejectedValueOnce(new Error('Initial error'));

    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => {
      expect(result.current.error).toBe('Initial error');
      expect(result.current.isLoading).toBe(false);
    });

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

    act(() => {
      result.current.refetch();
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    expect(result.current.isAuthenticated).toBe(true);
  });
});
