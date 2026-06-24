import {
  mockCallApiResponse,
  mockCallApiResponseOnce,
  rejectCallApi,
  rejectCallApiOnce,
  resetCallApiMock,
} from '@app/tests/apiMocks';
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
    vi.useRealTimers();
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

  it('should snooze a runtime notice for seven days before the final notice phase', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-22T12:00:00.000Z'));
    const mockVersionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice: {
        id: 'node20-removal-2026-07-30',
        kind: 'runtime_deprecation' as const,
        runtime: 'node' as const,
        currentVersion: 'v20.20.2',
        currentMajor: 20,
        removalDate: '2026-07-30',
        minimumVersion: '22.22.0',
        recommendedVersion: '24 LTS',
        documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
        reminderIntervalDays: 7 as const,
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

    expect(
      localStorage.getItem('promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30'),
    ).toBe('2026-06-22T12:00:00.000Z');
    expect(result.current.dismissed).toBe(true);
  });

  it('should apply the shorter reminder cadence when the final notice phase begins', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T12:00:00.000Z'));
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2026-07-15T12:00:00.000Z',
    );
    mockCallApiResponse({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice: {
        id: 'node20-removal-2026-07-30',
        kind: 'runtime_deprecation',
        runtime: 'node',
        currentVersion: 'v20.20.2',
        currentMajor: 20,
        removalDate: '2026-07-30',
        minimumVersion: '22.22.0',
        recommendedVersion: '24 LTS',
        documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
        reminderIntervalDays: 1,
      },
    });

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.dismissed).toBe(false);
  });

  it('should re-enable a snoozed runtime notice without reloading the page', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));
    const runtimeNotice = {
      id: 'node20-removal-2026-07-30',
      kind: 'runtime_deprecation' as const,
      runtime: 'node' as const,
      currentVersion: 'v20.20.2',
      currentMajor: 20,
      removalDate: '2026-07-30',
      minimumVersion: '22.22.0',
      recommendedVersion: '24 LTS',
      documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
      reminderIntervalDays: 7 as const,
    };
    mockCallApiResponse({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice,
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    act(() => result.current.dismissRuntimeNotice?.());
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7 * 24 * 60 * 60 * 1000);
    });

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.current.runtimeNoticeDismissed).toBe(false);
  });

  it('should refetch runtime policy when the support cutoff is reached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T23:59:00.000Z'));
    const runtimeNotice = {
      id: 'node20-removal-2026-07-30',
      kind: 'runtime_deprecation' as const,
      runtime: 'node' as const,
      currentVersion: 'v20.20.2',
      currentMajor: 20,
      removalDate: '2026-07-30',
      minimumVersion: '22.22.0',
      recommendedVersion: '24 LTS',
      documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
      reminderIntervalDays: 1 as const,
    };
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice,
    });
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: true,
      runtimeNotice,
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(true);
  });

  it('should advance runtime policy time when the cutoff refresh fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-29T23:59:00.000Z'));
    const runtimeNotice = {
      id: 'node20-removal-2026-07-30',
      kind: 'runtime_deprecation' as const,
      runtime: 'node' as const,
      currentVersion: 'v20.20.2',
      currentMajor: 20,
      removalDate: '2026-07-30',
      minimumVersion: '22.22.0',
      recommendedVersion: '24 LTS',
      documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
      reminderIntervalDays: 1 as const,
    };
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2026-07-29T12:00:00.000Z',
    );
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice,
    });
    rejectCallApiOnce(new Error('Policy refresh failed'));

    const { result, unmount } = renderHook(() => useVersionCheck());
    await act(async () => {});
    const initialPolicyTime = result.current.runtimePolicyUpdatedAt;
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(false);
    expect(result.current.runtimePolicyUpdatedAt).toBe(Date.parse('2026-07-30T00:00:00.000Z'));
    expect(result.current.runtimePolicyUpdatedAt).not.toBe(initialPolicyTime);

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('should preserve a retry after the refresh effect is replaced', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));
    const runtimeNotice = {
      id: 'node20-removal-2026-07-30',
      kind: 'runtime_deprecation' as const,
      runtime: 'node' as const,
      currentVersion: 'v20.20.2',
      currentMajor: 20,
      removalDate: '2026-07-30',
      minimumVersion: '22.22.0',
      recommendedVersion: '24 LTS',
      documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
      reminderIntervalDays: 7 as const,
    };
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2026-06-15T12:01:00.000Z',
    );
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice,
    });
    let rejectRefresh!: (reason?: unknown) => void;
    vi.mocked(callApi).mockImplementationOnce(
      () =>
        new Promise<Response>((_resolve, reject) => {
          rejectRefresh = reject;
        }),
    );
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice: { ...runtimeNotice, reminderIntervalDays: 1 },
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 1000);
    });
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.current.runtimeNoticeDismissed).toBe(false);

    await act(async () => {
      rejectRefresh(new Error('Policy refresh failed'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });

    expect(callApi).toHaveBeenCalledTimes(3);
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

    mockCallApiResponse(mockVersionInfo);

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
});
