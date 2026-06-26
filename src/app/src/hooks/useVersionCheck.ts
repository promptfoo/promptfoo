import { useCallback, useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { parseUtcMidnight } from '@app/utils/runtimeCompatibility';

export interface RuntimeCompatibilityNotice {
  id: string;
  kind: 'runtime_deprecation';
  runtime: 'node';
  currentVersion: string;
  currentMajor: number;
  removalDate: string;
  minimumVersion: string;
  recommendedVersion: string;
  documentationUrl: string;
}

export interface RuntimeCompatibilityPolicy {
  supportEndDate: string;
}

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateBlockedByRuntime?: boolean;
  runtimeNotice?: RuntimeCompatibilityNotice | null;
  runtimePolicy?: RuntimeCompatibilityPolicy | null;
  selfHosted?: boolean;
  isNpx?: boolean;
  updateCommands?: {
    primary: string;
    alternative: string | null;
  };
  commandType?: 'docker' | 'npx' | 'npm';
}

interface UseVersionCheckResult {
  versionInfo: VersionInfo | null;
  loading: boolean;
  error: Error | null;
  dismissed: boolean;
  dismiss: () => void;
  runtimeNoticeDismissed?: boolean;
  updateDismissed?: boolean;
  dismissRuntimeNotice?: () => void;
  dismissUpdate?: () => void;
  runtimePolicyUpdatedAt?: number;
}

const STORAGE_KEY = 'promptfoo:update:dismissedVersion';
const RUNTIME_NOTICE_STORAGE_KEY = 'promptfoo:runtime-notice:dismissed';
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const REFRESH_RETRY_MS = 5 * 60 * 1000;

// localStorage can throw (Safari private mode, disabled storage, exceeded quota). Dismissals are
// best-effort, so swallow failures instead of letting a click handler or background refresh throw.
// Mirrors the try/catch convention in useThemePreference.ts.
function safeLocalStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore: persistence is best-effort and the in-memory dismissal state still updates.
  }
}

function getRuntimePolicyRefreshDelay(supportEndDate: string): number | null {
  const now = Date.now();
  const removalTimestamp = parseUtcMidnight(supportEndDate);
  if (removalTimestamp === null || removalTimestamp <= now) {
    return null;
  }
  return Math.min(removalTimestamp - now, MAX_TIMER_DELAY_MS);
}

export function useVersionCheck(): UseVersionCheckResult {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dismissedRuntimeNoticeId, setDismissedRuntimeNoticeId] = useState(() =>
    safeLocalStorageGet(RUNTIME_NOTICE_STORAGE_KEY),
  );
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [runtimePolicyUpdatedAt, setRuntimePolicyUpdatedAt] = useState(() => Date.now());
  const isMountedRef = useRef(true);
  const runtimePolicyRetryTimerRef = useRef<number | undefined>(undefined);

  const clearRuntimePolicyRetry = useCallback(() => {
    if (runtimePolicyRetryTimerRef.current !== undefined) {
      window.clearTimeout(runtimePolicyRetryTimerRef.current);
      runtimePolicyRetryTimerRef.current = undefined;
    }
  }, []);

  const checkVersion = useCallback(
    async (background: boolean = false): Promise<boolean> => {
      try {
        const response = await callApi('/version');
        if (!response.ok) {
          throw new Error('Failed to fetch version information');
        }
        const data: VersionInfo = await response.json();

        clearRuntimePolicyRetry();
        if (isMountedRef.current) {
          setRuntimePolicyUpdatedAt(Date.now());
          setVersionInfo(data);
          setUpdateDismissed(safeLocalStorageGet(STORAGE_KEY) === data.latestVersion);
          setError(null);
        }
        return true;
      } catch (err) {
        if (isMountedRef.current && !background) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
        return false;
      } finally {
        if (isMountedRef.current && !background) {
          setLoading(false);
        }
      }
    },
    [clearRuntimePolicyRetry],
  );

  useEffect(() => {
    isMountedRef.current = true;

    void checkVersion();

    return () => {
      isMountedRef.current = false;
      clearRuntimePolicyRetry();
    };
  }, [checkVersion, clearRuntimePolicyRetry]);

  useEffect(() => {
    const supportEndDate =
      versionInfo?.runtimePolicy?.supportEndDate ?? versionInfo?.runtimeNotice?.removalDate;
    if (!supportEndDate) {
      return;
    }

    const delay = getRuntimePolicyRefreshDelay(supportEndDate);
    if (delay === null) {
      return;
    }

    const refresh = async () => {
      if (!isMountedRef.current) {
        return;
      }

      // Cancel any pending failure retry so a retry that fires mid-refresh can't start a second
      // concurrent /version fetch.
      clearRuntimePolicyRetry();

      // The refresh may fail without changing any request state. Advance this clock first so
      // consumers still re-evaluate time-based cutoff policy when the boundary is crossed.
      setRuntimePolicyUpdatedAt(Date.now());
      const succeeded = await checkVersion(true);
      if (!succeeded && isMountedRef.current) {
        clearRuntimePolicyRetry();
        runtimePolicyRetryTimerRef.current = window.setTimeout(() => {
          runtimePolicyRetryTimerRef.current = undefined;
          void refresh();
        }, REFRESH_RETRY_MS);
      }
    };
    const refreshTimer = window.setTimeout(refresh, delay);

    return () => {
      window.clearTimeout(refreshTimer);
    };
  }, [checkVersion, clearRuntimePolicyRetry, versionInfo]);

  const dismissRuntimeNotice = () => {
    if (versionInfo?.runtimeNotice) {
      safeLocalStorageSet(RUNTIME_NOTICE_STORAGE_KEY, versionInfo.runtimeNotice.id);
      setDismissedRuntimeNoticeId(versionInfo.runtimeNotice.id);
    }
  };

  const dismissUpdate = () => {
    if (versionInfo?.latestVersion) {
      safeLocalStorageSet(STORAGE_KEY, versionInfo.latestVersion);
      setUpdateDismissed(true);
    }
  };

  const dismiss = () => {
    if (versionInfo?.runtimeNotice) {
      dismissRuntimeNotice();
    } else {
      dismissUpdate();
    }
  };

  const runtimeNoticeDismissed = versionInfo?.runtimeNotice?.id === dismissedRuntimeNoticeId;
  const dismissed = versionInfo?.runtimeNotice ? runtimeNoticeDismissed : updateDismissed;

  return {
    versionInfo,
    loading,
    error,
    dismissed,
    dismiss,
    runtimeNoticeDismissed,
    updateDismissed,
    dismissRuntimeNotice,
    dismissUpdate,
    runtimePolicyUpdatedAt,
  };
}
