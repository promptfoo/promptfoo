import { StrictMode } from 'react';

import {
  getCallApiMock,
  mockCallApiResponse,
  mockCallApiResponseOnce,
  rejectCallApi,
  rejectCallApiOnce,
  resetCallApiMock,
} from '@app/tests/apiMocks';
import { restoreTestTimers, useTestTimers } from '@app/tests/timers';
import { callApi } from '@app/utils/api';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVersionCheck } from './useVersionCheck';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useVersionCheck', () => {
  beforeEach(() => {
    resetCallApiMock();
    localStorage.clear();
    // Note: Do NOT use vi.useFakeTimers() here - it breaks waitFor
    // Only use fake timers in specific tests that need timer control
  });

  afterEach(() => {
    restoreTestTimers();
    vi.restoreAllMocks();
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

    mockCallApiResponse(mockVersionInfo);

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

    mockCallApiResponse(mockVersionInfo);

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

    mockCallApiResponse(mockVersionInfo);

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.versionInfo).toEqual(mockVersionInfo);
    });

    act(() => {
      result.current.dismiss();
    });

    expect(localStorage.getItem('promptfoo:update:dismissedVersion')).toBe(
      mockVersionInfo.latestVersion,
    );
    expect(result.current.dismissed).toBe(true);
  });

  it('continues checking the version when localStorage reads throw', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const versionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
    };
    mockCallApiResponse(versionInfo);

    const { result } = renderHook(() => useVersionCheck());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getItemSpy).toHaveBeenCalledWith('promptfoo:update:dismissedVersion');
    expect(result.current.versionInfo).toEqual(versionInfo);
    expect(result.current.error).toBeNull();
    expect(result.current.dismissed).toBe(false);
  });

  it('dismisses the update in memory when localStorage writes throw', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const versionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
    };
    mockCallApiResponse(versionInfo);

    const { result } = renderHook(() => useVersionCheck());
    await waitFor(() => expect(result.current.versionInfo).toEqual(versionInfo));

    expect(() => {
      act(() => result.current.dismiss());
    }).not.toThrow();

    expect(setItemSpy).toHaveBeenCalledWith(
      'promptfoo:update:dismissedVersion',
      versionInfo.latestVersion,
    );
    expect(result.current.dismissed).toBe(true);
  });

  it('should only call the API once on mount and not refresh', async () => {
    const timers = useTestTimers();
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

    mockCallApiResponse(mockVersionInfo);

    const { result, rerender } = renderHook(() => useVersionCheck());

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(callApi).toHaveBeenCalledTimes(1);

    rerender();

    await act(async () => {
      await timers.advanceByAsync(10 * 60 * 1000);
    });

    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('should handle network errors by setting loading=false and populating the error state', async () => {
    rejectCallApi(new Error('Network error'));

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

  it('retries failed version checks and clears the error after recovering', async () => {
    const timers = useTestTimers();
    const versionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
    };
    rejectCallApiOnce(new Error('First network error'));
    rejectCallApiOnce(new Error('Second network error'));
    mockCallApiResponseOnce(versionInfo);

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.error?.message).toBe('First network error');
    expect(callApi).toHaveBeenCalledTimes(1);

    await act(async () => {
      await timers.advanceByAsync(5 * 60 * 1000 - 1);
    });
    expect(callApi).toHaveBeenCalledTimes(1);

    await act(async () => {
      await timers.advanceByAsync(1);
    });
    expect(result.current.error?.message).toBe('Second network error');
    expect(callApi).toHaveBeenCalledTimes(2);

    await act(async () => {
      await timers.advanceByAsync(5 * 60 * 1000);
    });
    expect(callApi).toHaveBeenCalledTimes(3);
    expect(result.current.versionInfo).toEqual(versionInfo);
    expect(result.current.error).toBeNull();

    await act(async () => {
      await timers.advanceByAsync(5 * 60 * 1000);
    });
    expect(callApi).toHaveBeenCalledTimes(3);
  });

  it('clears a pending retry when the hook unmounts', async () => {
    const timers = useTestTimers();
    rejectCallApi(new Error('Network error'));

    const { unmount } = renderHook(() => useVersionCheck());
    await act(async () => {});

    expect(timers.getTimerCount()).toBe(1);
    unmount();
    expect(timers.getTimerCount()).toBe(0);

    await act(async () => {
      await timers.advanceByAsync(5 * 60 * 1000);
    });
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('ignores stale StrictMode requests after a newer version check succeeds', async () => {
    const timers = useTestTimers();
    let rejectStaleRequest!: (reason: Error) => void;
    getCallApiMock().mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectStaleRequest = reject;
        }),
    );
    const versionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
    };
    mockCallApiResponseOnce(versionInfo);

    const { result } = renderHook(() => useVersionCheck(), { wrapper: StrictMode });
    await act(async () => {});

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo).toEqual(versionInfo);
    expect(result.current.error).toBeNull();

    await act(async () => {
      rejectStaleRequest(new Error('Stale network error'));
    });

    expect(result.current.versionInfo).toEqual(versionInfo);
    expect(result.current.error).toBeNull();
    expect(timers.getTimerCount()).toBe(0);
  });

  it('does not schedule a retry if an in-flight request fails after unmounting', async () => {
    const timers = useTestTimers();
    let rejectRequest!: (reason: Error) => void;
    getCallApiMock().mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectRequest = reject;
        }),
    );

    const { unmount } = renderHook(() => useVersionCheck());
    unmount();

    await act(async () => {
      rejectRequest(new Error('Network error'));
    });

    expect(timers.getTimerCount()).toBe(0);
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});
