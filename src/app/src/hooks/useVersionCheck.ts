import { useCallback, useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';

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
  reminderIntervalDays: 1 | 7;
}

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  updateBlockedByRuntime?: boolean;
  runtimeNotice?: RuntimeCompatibilityNotice | null;
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
}

const STORAGE_KEY = 'promptfoo:update:dismissedVersion';
const RUNTIME_NOTICE_STORAGE_PREFIX = 'promptfoo:runtime-notice:lastDismissedAt:';
const DAY_MS = 24 * 60 * 60 * 1000;
const FINAL_NOTICE_PHASE_MS = 14 * DAY_MS;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const REFRESH_RETRY_MS = 5 * 60 * 1000;

function getRuntimeNoticeStorageKey(noticeId: string): string {
  return `${RUNTIME_NOTICE_STORAGE_PREFIX}${noticeId}`;
}

function isRuntimeNoticeSnoozed(notice: RuntimeCompatibilityNotice): boolean {
  const lastDismissedAt = localStorage.getItem(getRuntimeNoticeStorageKey(notice.id));
  if (!lastDismissedAt) {
    return false;
  }

  const lastDismissedTimestamp = Date.parse(lastDismissedAt);
  return (
    !Number.isNaN(lastDismissedTimestamp) &&
    Date.now() - lastDismissedTimestamp < notice.reminderIntervalDays * DAY_MS
  );
}

function getRuntimeNoticeRefreshDelay(
  notice: RuntimeCompatibilityNotice,
  noticeDismissed: boolean,
): number | null {
  const now = Date.now();
  const removalTimestamp = Date.parse(`${notice.removalDate}T00:00:00.000Z`);
  if (Number.isNaN(removalTimestamp)) {
    return null;
  }

  const futureBoundaries = [removalTimestamp - FINAL_NOTICE_PHASE_MS, removalTimestamp].filter(
    (timestamp) => timestamp > now,
  );

  if (noticeDismissed) {
    const lastDismissedAt = localStorage.getItem(getRuntimeNoticeStorageKey(notice.id));
    const lastDismissedTimestamp = lastDismissedAt ? Date.parse(lastDismissedAt) : Number.NaN;
    if (!Number.isNaN(lastDismissedTimestamp)) {
      const snoozeExpiry = lastDismissedTimestamp + notice.reminderIntervalDays * DAY_MS;
      if (snoozeExpiry > now) {
        futureBoundaries.push(snoozeExpiry);
      }
    }
  }

  if (futureBoundaries.length === 0) {
    return null;
  }

  return Math.min(Math.min(...futureBoundaries) - now, MAX_TIMER_DELAY_MS);
}

export function useVersionCheck(): UseVersionCheckResult {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [runtimeNoticeDismissed, setRuntimeNoticeDismissed] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const isMountedRef = useRef(true);

  const checkVersion = useCallback(async (background: boolean = false): Promise<boolean> => {
    try {
      const response = await callApi('/version');
      if (!response.ok) {
        throw new Error('Failed to fetch version information');
      }
      const data: VersionInfo = await response.json();

      if (isMountedRef.current) {
        setVersionInfo(data);
        setRuntimeNoticeDismissed(
          data.runtimeNotice ? isRuntimeNoticeSnoozed(data.runtimeNotice) : false,
        );
        setUpdateDismissed(localStorage.getItem(STORAGE_KEY) === data.latestVersion);
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
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    void checkVersion();

    return () => {
      isMountedRef.current = false;
    };
  }, [checkVersion]);

  useEffect(() => {
    const notice = versionInfo?.runtimeNotice;
    if (!notice) {
      return;
    }

    const delay = getRuntimeNoticeRefreshDelay(notice, runtimeNoticeDismissed);
    if (delay === null) {
      return;
    }

    let retryTimer: number | undefined;
    const refresh = async () => {
      setRuntimeNoticeDismissed(isRuntimeNoticeSnoozed(notice));
      const succeeded = await checkVersion(true);
      if (!succeeded && isMountedRef.current) {
        retryTimer = window.setTimeout(refresh, REFRESH_RETRY_MS);
      }
    };
    const refreshTimer = window.setTimeout(refresh, delay);

    return () => {
      window.clearTimeout(refreshTimer);
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [checkVersion, runtimeNoticeDismissed, versionInfo?.runtimeNotice]);

  const dismissRuntimeNotice = () => {
    if (versionInfo?.runtimeNotice) {
      localStorage.setItem(
        getRuntimeNoticeStorageKey(versionInfo.runtimeNotice.id),
        new Date(Date.now()).toISOString(),
      );
      setRuntimeNoticeDismissed(true);
    }
  };

  const dismissUpdate = () => {
    if (versionInfo?.latestVersion) {
      localStorage.setItem(STORAGE_KEY, versionInfo.latestVersion);
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
  };
}
