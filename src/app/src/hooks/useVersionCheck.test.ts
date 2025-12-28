import { ApiRequestError, callApiTyped } from '@app/utils/apiClient';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVersionCheck } from './useVersionCheck';

vi.mock('@app/utils/apiClient', () => ({
  callApiTyped: vi.fn(),
  ApiRequestError: class extends Error {
    constructor(
      public readonly route: string,
      public readonly status: number,
      public readonly statusText: string,
      public readonly body?: string,
    ) {
      super(`API request failed for ${route}: ${status} ${statusText}`);
      this.name = 'ApiRequestError';
    }
  },
}));

describe('useVersionCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Note: Do NOT use vi.useFakeTimers() here - it breaks waitFor
    // Only use fake timers in specific tests that need timer control
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with loading=true, error=null, dismissed=false, and versionInfo=null', () => {
    const { result } = renderHook(() => useVersionCheck());

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.dismissed).toBe(false);
    expect(result.current.versionInfo).toBeNull();
  });

  it('should set versionInfo, loading=false, and error=null on a successful API call', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm i -g promptfoo@latest',
        alternative: 'npx promptfoo@latest',
        commandType: 'npm' as const,
      },
      commandType: 'npm' as const,
    };

    vi.mocked(callApiTyped).mockResolvedValue(mockVersionInfo);

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.versionInfo).toEqual(mockVersionInfo);
    expect(result.current.error).toBeNull();
    expect(callApiTyped).toHaveBeenCalledTimes(1);
    expect(callApiTyped).toHaveBeenCalledWith('/version');
  });

  it('should set dismissed=true if the latest version matches the value in localStorage', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm i -g promptfoo@latest',
        alternative: 'npx promptfoo@latest',
        commandType: 'npm' as const,
      },
      commandType: 'npm' as const,
    };
    const STORAGE_KEY = 'promptfoo:update:dismissedVersion';

    localStorage.setItem(STORAGE_KEY, mockVersionInfo.latestVersion);

    vi.mocked(callApiTyped).mockResolvedValue(mockVersionInfo);

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.dismissed).toBe(true);
  });

  it('should store the latest version in localStorage and set dismissed=true when dismiss is called and versionInfo.latestVersion is present', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm i -g promptfoo@latest',
        alternative: 'npx promptfoo@latest',
        commandType: 'npm' as const,
      },
      commandType: 'npm' as const,
    };

    vi.mocked(callApiTyped).mockResolvedValue(mockVersionInfo);

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.versionInfo).toEqual(mockVersionInfo);
    });

    act(() => {
      result.current.dismiss();
    });

    expect(setItemSpy).toHaveBeenCalledWith(
      'promptfoo:update:dismissedVersion',
      mockVersionInfo.latestVersion,
    );
    expect(result.current.dismissed).toBe(true);
  });

  it('should only call the API once on mount and not refresh', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm i -g promptfoo@latest',
        alternative: 'npx promptfoo@latest',
        commandType: 'npm' as const,
      },
      commandType: 'npm' as const,
    };

    vi.mocked(callApiTyped).mockResolvedValue(mockVersionInfo);

    const { result, rerender } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(callApiTyped).toHaveBeenCalledTimes(1);

    rerender();

    // Wait a short time to ensure no additional calls are made
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(callApiTyped).toHaveBeenCalledTimes(1);
  });

  it('should handle network errors by setting loading=false and populating the error state', async () => {
    vi.mocked(callApiTyped).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(callApiTyped).toHaveBeenCalledTimes(1);
    expect(callApiTyped).toHaveBeenCalledWith('/version');
  });

  it('should handle non-OK HTTP responses by setting error state', async () => {
    // callApiTyped throws ApiRequestError for non-OK responses
    const error = new ApiRequestError('/version', 500, 'Internal Server Error');
    vi.mocked(callApiTyped).mockRejectedValue(error);

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe(
      'API request failed for /version: 500 Internal Server Error',
    );
    expect(result.current.versionInfo).toBeNull();
    expect(callApiTyped).toHaveBeenCalledTimes(1);
    expect(callApiTyped).toHaveBeenCalledWith('/version');
  });
});
