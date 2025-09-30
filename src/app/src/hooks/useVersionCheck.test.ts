import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callApi } from '@app/utils/api';
import { useVersionStore } from '@app/stores/versionStore';
import { useVersionCheck } from './useVersionCheck';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useVersionCheck', () => {
  const initialState = useVersionStore.getState();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset store to initial state
    useVersionStore.setState(initialState, true);
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
      },
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersionInfo),
    } as Response);

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.versionInfo).toEqual(mockVersionInfo);
    expect(result.current.error).toBeNull();
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/version');
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
      },
    };
    const STORAGE_KEY = 'promptfoo:update:dismissedVersion';

    localStorage.setItem(STORAGE_KEY, mockVersionInfo.latestVersion);

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersionInfo),
    } as Response);

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
      },
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersionInfo),
    } as Response);

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
      },
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersionInfo),
    } as Response);

    const { result, rerender } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(callApi).toHaveBeenCalledTimes(1);

    rerender();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('should handle network errors by setting loading=false and populating the error state', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/version');
  });

  it('should only trigger a single fetchVersion call when multiple components mount simultaneously', async () => {
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm i -g promptfoo@latest',
        alternative: 'npx promptfoo@latest',
      },
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersionInfo),
    } as Response);

    const { result: result1 } = renderHook(() => useVersionCheck());
    const { result: result2 } = renderHook(() => useVersionCheck());
    const { result: result3 } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
      expect(result2.current.loading).toBe(false);
      expect(result3.current.loading).toBe(false);
    });

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(result1.current.versionInfo).toEqual(mockVersionInfo);
    expect(result2.current.versionInfo).toEqual(mockVersionInfo);
    expect(result3.current.versionInfo).toEqual(mockVersionInfo);
  });

  it('should handle API responses with non-200 status codes but valid JSON error bodies', async () => {
    const mockErrorResponse = {
      message: 'Rate limit exceeded',
      code: 'RATE_LIMIT',
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve(mockErrorResponse),
    } as Response);

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to fetch version information');
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/version');
  });

  it('should allow refetching version information after a previous request has failed', async () => {
    vi.mocked(callApi).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');

    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      selfHosted: true,
      isNpx: false,
      updateCommands: {
        primary: 'npm i -g promptfoo@latest',
        alternative: 'npx promptfoo@latest',
      },
    };

    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockVersionInfo),
    } as Response);

    await useVersionStore.getState().fetchVersion();

    await waitFor(() => {
      expect(result.current.versionInfo).toEqual(mockVersionInfo);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should reset state on logout when version information is loading', async () => {
    vi.mocked(callApi).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            currentVersion: '1.0.0',
            latestVersion: '1.1.0',
            updateAvailable: true,
            selfHosted: true,
            isNpx: false,
            updateCommands: {
              primary: 'npm i -g promptfoo@latest',
              alternative: 'npx promptfoo@latest',
            },
          }),
      } as Response;
    });

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    act(() => {
      useVersionStore.setState(initialState, true);
    });

    expect(result.current.versionInfo).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.dismissed).toBe(false);
  });
});
