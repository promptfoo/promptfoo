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

    // Wait a short time to ensure no additional calls are made
    await new Promise((resolve) => setTimeout(resolve, 50));

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
});
