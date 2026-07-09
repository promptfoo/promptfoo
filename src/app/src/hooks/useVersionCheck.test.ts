import { restoreTestTimers, useTestTimers } from '@app/tests/timers';
import { callApiJson } from '@app/utils/api';
import { ApiRoutes, VersionSchemas } from '@promptfoo/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVersionCheck } from './useVersionCheck';

vi.mock('@app/utils/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@app/utils/api')>()),
  callApiJson: vi.fn(),
  fetchUserEmail: vi.fn(() => Promise.resolve('test@example.com')),
  fetchUserId: vi.fn(() => Promise.resolve('test-user-id')),
  updateEvalAuthor: vi.fn(() => Promise.resolve({})),
}));

describe('useVersionCheck', () => {
  const mockCallApiJson = vi.mocked(callApiJson);
  const mockCallApiResponse = (response: unknown) => {
    mockCallApiJson.mockResolvedValue(response as never);
  };
  const mockCallApiResponseOnce = (response: unknown) => {
    mockCallApiJson.mockResolvedValueOnce(response as never);
  };
  const rejectCallApiOnce = (error: Error) => {
    mockCallApiJson.mockRejectedValueOnce(error);
  };

  beforeEach(() => {
    mockCallApiJson.mockReset();
    localStorage.clear();
    // Only use fake timers in specific tests that need timer control.
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

    mockCallApiJson.mockResolvedValue(mockVersionInfo as any);

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.versionInfo).toEqual(mockVersionInfo);
    expect(result.current.error).toBeNull();
    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
    expect(mockCallApiJson).toHaveBeenCalledWith(ApiRoutes.Version, VersionSchemas.Response);
  });

  it('should refresh runtime policy time when the initial response crosses the cutoff', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-29T23:59:59.900Z'));
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
    };
    let resolveVersion!: (response: unknown) => void;
    mockCallApiJson.mockReturnValueOnce(
      new Promise<unknown>((resolve) => {
        resolveVersion = resolve;
      }) as never,
    );

    const { result } = renderHook(() => useVersionCheck());
    expect(result.current.runtimePolicyUpdatedAt).toBe(Date.parse('2026-07-29T23:59:59.900Z'));

    timers.setSystemTime(new Date('2026-07-30T00:00:00.100Z'));
    await act(async () => {
      resolveVersion({
        currentVersion: '1.0.0',
        latestVersion: '1.1.0',
        updateAvailable: true,
        updateBlockedByRuntime: false,
        runtimeNotice,
      });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.runtimePolicyUpdatedAt).toBe(Date.parse('2026-07-30T00:00:00.100Z'));
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

    mockCallApiJson.mockResolvedValue(mockVersionInfo as any);

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

    mockCallApiJson.mockResolvedValue(mockVersionInfo as any);

    const { result } = renderHook(() => useVersionCheck());

    await act(async () => {});
    expect(result.current.versionInfo).toEqual(mockVersionInfo);

    act(() => {
      result.current.dismiss();
    });

    expect(localStorage.getItem('promptfoo:update:dismissedVersion')).toBe(
      mockVersionInfo.latestVersion,
    );
    expect(result.current.dismissed).toBe(true);
  });

  it('should persist and expire a runtime notice dismissal on the weekly cadence', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));
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
      },
    };

    mockCallApiResponse(mockVersionInfo);
    const { result } = renderHook(() => useVersionCheck());

    await act(async () => {});
    expect(result.current.versionInfo).toEqual(mockVersionInfo);

    timers.setSystemTime(new Date('2026-06-22T12:00:00.001Z'));
    act(() => {
      result.current.dismiss();
    });

    expect(
      localStorage.getItem('promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30'),
    ).toBe('2026-06-22T12:00:00.001Z');
    expect(result.current.dismissed).toBe(true);

    await act(async () => {
      await timers.advanceByAsync(7 * 24 * 60 * 60 * 1000 - 1);
    });
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await timers.advanceByAsync(1);
    });
    expect(result.current.runtimeNoticeDismissed).toBe(false);
  });

  it('expires an in-memory runtime dismissal when localStorage writes throw', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
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
      },
    };

    mockCallApiResponse(mockVersionInfo);
    const { result } = renderHook(() => useVersionCheck());

    await act(async () => {});
    expect(result.current.versionInfo).toEqual(mockVersionInfo);

    expect(() => {
      act(() => {
        result.current.dismiss();
      });
    }).not.toThrow();

    expect(setItemSpy).toHaveBeenCalled();
    // The write failed, but the in-memory dismissal still updates so the banner can be dismissed.
    expect(result.current.dismissed).toBe(true);
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await timers.advanceByAsync(7 * 24 * 60 * 60 * 1000);
    });
    expect(result.current.runtimeNoticeDismissed).toBe(false);
  });

  it('keeps a fresher in-memory dismissal when persistence fails and policy refreshes', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
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
    };
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2026-07-01T00:00:00.000Z',
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    mockCallApiResponse({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      runtimeNotice,
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(result.current.runtimeNoticeDismissed).toBe(false);

    act(() => {
      result.current.dismiss();
    });
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await timers.advanceByAsync(12 * 60 * 60 * 1000);
    });
    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await timers.advanceByAsync(12 * 60 * 60 * 1000);
    });
    expect(result.current.runtimeNoticeDismissed).toBe(false);
  });

  it('adopts a newer cross-tab dismissal over a stale in-memory one on refresh', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-01T00:00:00.000Z'));
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
    };
    mockCallApiResponse({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      runtimeNotice,
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(result.current.runtimeNoticeDismissed).toBe(false);

    // Dismiss in this tab at 07-01; the weekly snooze would otherwise expire at 07-08.
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    // Another tab dismisses more recently, leaving a strictly newer timestamp in localStorage.
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2026-07-03T00:00:00.000Z',
    );

    // The refresh scheduled at the in-memory dismissal's 07-08 expiry must adopt the newer stored
    // dismissal, so the notice stays snoozed past 07-08 (a regression that kept `current` would
    // re-show it here).
    await act(async () => {
      await timers.advanceByAsync(7 * 24 * 60 * 60 * 1000);
    });
    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.runtimeNoticeDismissed).toBe(true);
  });

  it('applies the daily cadence to persisted dismissals in the final notice phase', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-17T12:00:00.000Z'));
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2026-07-17T00:00:00.000Z',
    );
    mockCallApiResponse({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
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
      },
    });

    const { result } = renderHook(() => useVersionCheck());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runtimeNoticeDismissed).toBe(true);
  });

  it('shortens an in-flight weekly dismissal at the final-phase boundary even if refresh fails', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
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
    };
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2026-07-15T00:00:00.000Z',
    );
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      runtimeNotice,
    });
    rejectCallApiOnce(new Error('Policy refresh failed'));

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(result.current.runtimeNoticeDismissed).toBe(true);

    await act(async () => {
      await timers.advanceByAsync(12 * 60 * 60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.runtimeNoticeDismissed).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fails open for a future persisted runtime dismissal', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-22T12:00:00.000Z'));
    localStorage.setItem(
      'promptfoo:runtime-notice:lastDismissedAt:node20-removal-2026-07-30',
      '2099-01-01T00:00:00.000Z',
    );
    mockCallApiResponse({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
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
      },
    });

    const { result } = renderHook(() => useVersionCheck());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runtimeNoticeDismissed).toBe(false);
  });

  it('fails open when localStorage reads throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    mockCallApiResponse({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
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
      },
    });

    const { result } = renderHook(() => useVersionCheck());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.runtimeNoticeDismissed).toBe(false);
  });

  it('should refetch runtime policy when the support cutoff is reached', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-29T23:59:00.000Z'));
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
      await timers.advanceByAsync(60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(true);
  });

  it('should keep the cutoff refresh scheduled after a dismissal', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-29T00:00:00.000Z'));
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
      updateAvailable: false,
      updateBlockedByRuntime: true,
      runtimeNotice,
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});

    await act(async () => {
      await timers.advanceByAsync(23 * 60 * 60 * 1000);
    });
    act(() => result.current.dismissRuntimeNotice?.());

    await act(async () => {
      await timers.advanceByAsync(60 * 60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(true);
  });

  it('preserves an in-memory update dismissal across policy refresh when storage fails', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-29T23:59:00.000Z'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const versionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      runtimePolicy: { supportEndDate: '2026-07-30' },
    };
    mockCallApiResponse(versionInfo);

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});

    act(() => {
      result.current.dismissUpdate?.();
    });
    expect(result.current.updateDismissed).toBe(true);

    await act(async () => {
      await timers.advanceByAsync(60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.updateDismissed).toBe(true);
  });

  it('should refetch cutoff policy when runtime warnings are disabled', async () => {
    const timers = useTestTimers();
    const startTime = Date.parse('2026-06-22T00:00:00.000Z');
    const cutoffTime = Date.parse('2026-07-30T00:00:00.000Z');
    const maxTimerDelay = 2_147_000_000;
    timers.setSystemTime(new Date(startTime));
    const runtimePolicy = { supportEndDate: '2026-07-30' };
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice: null,
      runtimePolicy,
    });
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice: null,
      runtimePolicy,
    });
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      updateBlockedByRuntime: true,
      runtimeNotice: null,
      runtimePolicy,
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(false);

    await act(async () => {
      await timers.advanceByAsync(maxTimerDelay);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(false);

    await act(async () => {
      await timers.advanceByAsync(cutoffTime - startTime - maxTimerDelay);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(3);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(true);
  });

  it('should advance suppressed runtime policy when the cutoff refresh fails', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-29T23:59:00.000Z'));
    const runtimePolicy = { supportEndDate: '2026-07-30' };
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice: null,
      runtimePolicy,
    });
    rejectCallApiOnce(new Error('Policy refresh failed'));

    const { result, unmount } = renderHook(() => useVersionCheck());
    await act(async () => {});
    const initialPolicyTime = result.current.runtimePolicyUpdatedAt;

    await act(async () => {
      await timers.advanceByAsync(60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(false);
    expect(result.current.runtimePolicyUpdatedAt).toBe(Date.parse('2026-07-30T00:00:00.000Z'));
    expect(result.current.runtimePolicyUpdatedAt).not.toBe(initialPolicyTime);

    unmount();
  });

  it('should advance runtime policy time when the cutoff refresh fails', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-29T23:59:00.000Z'));
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
      await timers.advanceByAsync(60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(false);
    expect(result.current.runtimePolicyUpdatedAt).toBe(Date.parse('2026-07-30T00:00:00.000Z'));
    expect(result.current.runtimePolicyUpdatedAt).not.toBe(initialPolicyTime);

    unmount();
    await act(async () => {
      await timers.advanceByAsync(5 * 60 * 1000);
    });
    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
  });

  it('should retry a failed cutoff refresh', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-07-29T23:59:00.000Z'));
    const runtimePolicy = { supportEndDate: '2026-07-30' };
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: true,
      updateBlockedByRuntime: false,
      runtimeNotice: null,
      runtimePolicy,
    });
    rejectCallApiOnce(new Error('Policy refresh failed'));
    mockCallApiResponseOnce({
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      updateBlockedByRuntime: true,
      runtimeNotice: null,
      runtimePolicy,
    });

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});

    await act(async () => {
      await timers.advanceByAsync(60 * 1000);
    });
    expect(mockCallApiJson).toHaveBeenCalledTimes(2);

    await act(async () => {
      await timers.advanceByAsync(5 * 60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(3);
    expect(result.current.versionInfo?.updateBlockedByRuntime).toBe(true);
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

    mockCallApiJson.mockResolvedValue(mockVersionInfo as any);

    const { result, rerender } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);

    rerender();

    // Wait a short time to ensure no additional calls are made
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
  });

  it('should handle network errors by setting loading=false and populating the error state', async () => {
    mockCallApiJson.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useVersionCheck());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
    expect(mockCallApiJson).toHaveBeenCalledTimes(1);
    expect(mockCallApiJson).toHaveBeenCalledWith(ApiRoutes.Version, VersionSchemas.Response);
  });

  it('should retry an initial version-check failure and recover the runtime policy', async () => {
    const timers = useTestTimers();
    timers.setSystemTime(new Date('2026-06-22T12:00:00.000Z'));
    const versionInfo = {
      currentVersion: '1.0.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
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
      },
    };
    rejectCallApiOnce(new Error('Network error'));
    mockCallApiResponseOnce(versionInfo);

    const { result } = renderHook(() => useVersionCheck());
    await act(async () => {});
    expect(result.current.error?.message).toBe('Network error');
    expect(mockCallApiJson).toHaveBeenCalledTimes(1);

    await act(async () => {
      await timers.advanceByAsync(5 * 60 * 1000);
    });

    expect(mockCallApiJson).toHaveBeenCalledTimes(2);
    expect(result.current.versionInfo).toEqual(versionInfo);
    expect(result.current.error).toBeNull();
  });
});
