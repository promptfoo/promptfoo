import { useEffect, useRef, useState } from 'react';

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

export function useVersionCheck(): UseVersionCheckResult {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [runtimeNoticeDismissed, setRuntimeNoticeDismissed] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const checkVersion = async () => {
      try {
        const response = await callApi('/version');
        if (!response.ok) {
          throw new Error('Failed to fetch version information');
        }
        const data: VersionInfo = await response.json();

        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setVersionInfo(data);

          setRuntimeNoticeDismissed(
            data.runtimeNotice ? isRuntimeNoticeSnoozed(data.runtimeNotice) : false,
          );
          setUpdateDismissed(localStorage.getItem(STORAGE_KEY) === data.latestVersion);
        }
      } catch (err) {
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setError(err instanceof Error ? err : new Error('Unknown error'));
        }
      } finally {
        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    checkVersion();

    // Cleanup function to mark component as unmounted
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
