import { useCallback, useEffect, useRef, useState } from 'react';

import { callApiJson } from '@app/utils/api';
import {
  FINAL_RUNTIME_NOTICE_PHASE_MS,
  getRuntimeNoticeReminderIntervalDays,
  parseUtcMidnight,
} from '@app/utils/runtimeCompatibility';
import { ApiRoutes, VersionSchemas } from '@promptfoo/contracts';

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
  blockedUpdateNotice?: RuntimeCompatibilityNotice | null;
  runtimePolicy?: RuntimeCompatibilityPolicy | null;
  selfHosted?: boolean;
  isNpx?: boolean;
  updateCommands?: {
    primary: string;
    alternative: string | null;
    commandType?: 'docker' | 'npx' | 'npm';
    isCustomContainer?: boolean;
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
const RUNTIME_NOTICE_STORAGE_PREFIX = 'promptfoo:runtime-notice:lastDismissedAt:';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_000_000;
const REFRESH_RETRY_MS = 5 * 60 * 1000;

interface RuntimeNoticeDismissal {
  noticeId: string;
  dismissedAt: number;
}

function getRuntimeNoticeStorageKey(noticeId: string): string {
  return `${RUNTIME_NOTICE_STORAGE_PREFIX}${noticeId}`;
}

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

function readRuntimeNoticeDismissal(noticeId: string): RuntimeNoticeDismissal | null {
  const stored = safeLocalStorageGet(getRuntimeNoticeStorageKey(noticeId));
  const dismissedAt = stored ? Date.parse(stored) : Number.NaN;
  const now = Date.now();
  if (
    Number.isNaN(dismissedAt) ||
    new Date(dismissedAt).toISOString() !== stored ||
    dismissedAt > now
  ) {
    return null;
  }
  return { noticeId, dismissedAt };
}

function isRuntimeNoticeSnoozed(
  notice: RuntimeCompatibilityNotice,
  dismissal: RuntimeNoticeDismissal | null,
  now: number,
): boolean {
  return (
    dismissal?.noticeId === notice.id &&
    dismissal.dismissedAt <= now &&
    now - dismissal.dismissedAt <
      getRuntimeNoticeReminderIntervalDays(notice.removalDate, now) * DAY_MS
  );
}

function getRuntimePolicyRefreshDelay(
  supportEndDate: string,
  notice: RuntimeCompatibilityNotice | null | undefined,
  dismissal: RuntimeNoticeDismissal | null,
  now: number = Date.now(),
): number | null {
  const removalTimestamp = parseUtcMidnight(supportEndDate);
  const pendingBoundaries: number[] = [];
  if (removalTimestamp !== null) {
    pendingBoundaries.push(removalTimestamp);
  }
  if (notice && removalTimestamp !== null) {
    pendingBoundaries.push(removalTimestamp - FINAL_RUNTIME_NOTICE_PHASE_MS);
  }
  if (notice && dismissal?.noticeId === notice.id && dismissal.dismissedAt <= now) {
    pendingBoundaries.push(
      dismissal.dismissedAt +
        getRuntimeNoticeReminderIntervalDays(notice.removalDate, now) * DAY_MS,
    );
  }

  const nextBoundary = Math.min(...pendingBoundaries.filter((timestamp) => timestamp > now));
  return Number.isFinite(nextBoundary) ? Math.min(nextBoundary - now, MAX_TIMER_DELAY_MS) : null;
}

export function useVersionCheck(): UseVersionCheckResult {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [runtimeNoticeDismissal, setRuntimeNoticeDismissal] =
    useState<RuntimeNoticeDismissal | null>(null);
  const [updateDismissedVersion, setUpdateDismissedVersion] = useState<string | null>(null);
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
        const data = await callApiJson(ApiRoutes.Version, VersionSchemas.Response);

        clearRuntimePolicyRetry();
        if (isMountedRef.current) {
          setRuntimePolicyUpdatedAt(Date.now());
          setVersionInfo(data);
          setRuntimeNoticeDismissal((current) => {
            const noticeId = data.runtimeNotice?.id;
            if (!noticeId) {
              return null;
            }
            const stored = readRuntimeNoticeDismissal(noticeId);
            return current?.noticeId === noticeId &&
              (!stored || current.dismissedAt > stored.dismissedAt)
              ? current
              : stored;
          });
          setUpdateDismissedVersion((current) => {
            const stored = safeLocalStorageGet(STORAGE_KEY);
            return stored === data.latestVersion || current === data.latestVersion
              ? data.latestVersion
              : null;
          });
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

    const load = async () => {
      const succeeded = await checkVersion();
      if (!succeeded && isMountedRef.current) {
        clearRuntimePolicyRetry();
        runtimePolicyRetryTimerRef.current = window.setTimeout(() => {
          runtimePolicyRetryTimerRef.current = undefined;
          void load();
        }, REFRESH_RETRY_MS);
      }
    };

    void load();

    return () => {
      isMountedRef.current = false;
      clearRuntimePolicyRetry();
    };
  }, [checkVersion, clearRuntimePolicyRetry]);

  useEffect(() => {
    const notice = versionInfo?.runtimeNotice;
    const supportEndDate = versionInfo?.runtimePolicy?.supportEndDate ?? notice?.removalDate;
    if (!supportEndDate) {
      return;
    }

    const delay = getRuntimePolicyRefreshDelay(
      supportEndDate,
      notice,
      runtimeNoticeDismissal,
      runtimePolicyUpdatedAt,
    );
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
  }, [
    checkVersion,
    clearRuntimePolicyRetry,
    runtimeNoticeDismissal,
    runtimePolicyUpdatedAt,
    versionInfo,
  ]);

  const dismissRuntimeNotice = () => {
    if (versionInfo?.runtimeNotice) {
      const dismissedAt = Date.now();
      safeLocalStorageSet(
        getRuntimeNoticeStorageKey(versionInfo.runtimeNotice.id),
        new Date(dismissedAt).toISOString(),
      );
      setRuntimeNoticeDismissal({ noticeId: versionInfo.runtimeNotice.id, dismissedAt });
      setRuntimePolicyUpdatedAt(dismissedAt);
    }
  };

  const dismissUpdate = () => {
    if (versionInfo?.latestVersion) {
      safeLocalStorageSet(STORAGE_KEY, versionInfo.latestVersion);
      setUpdateDismissedVersion(versionInfo.latestVersion);
    }
  };

  const dismiss = () => {
    if (versionInfo?.runtimeNotice) {
      dismissRuntimeNotice();
    } else {
      dismissUpdate();
    }
  };

  const runtimeNoticeDismissed = versionInfo?.runtimeNotice
    ? isRuntimeNoticeSnoozed(
        versionInfo.runtimeNotice,
        runtimeNoticeDismissal,
        runtimePolicyUpdatedAt,
      )
    : false;
  const updateDismissed = updateDismissedVersion === versionInfo?.latestVersion;
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
