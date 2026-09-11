import { useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';

interface VersionInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  selfHosted?: boolean;
  isNpx?: boolean;
  updateCommands?: {
    primary: string;
    alternative: string | null;
    /** Custom images have no copyable command; the owner rebuilds from their own source. */
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
}

const STORAGE_KEY = 'promptfoo:update:dismissedVersion';
const RETRY_DELAY_MS = 5 * 60 * 1000;

// localStorage throws in Safari private mode and when storage is disabled or full. Dismissal
// persistence is best-effort; a failure must never break the version check.
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
    // Ignore: the in-memory dismissal state still updates for this session.
  }
}

export function useVersionCheck(): UseVersionCheckResult {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    let retryTimer: number | undefined;

    const checkVersion = async () => {
      try {
        const response = await callApi('/version');
        if (!response.ok) {
          throw new Error('Failed to fetch version information');
        }
        const data: VersionInfo = await response.json();

        if (!active) {
          return;
        }

        setVersionInfo(data);
        setError(null);
        setDismissed(safeLocalStorageGet(STORAGE_KEY) === data.latestVersion);
      } catch (err) {
        if (!active) {
          return;
        }

        setError(err instanceof Error ? err : new Error('Unknown error'));
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          void checkVersion();
        }, RETRY_DELAY_MS);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void checkVersion();

    return () => {
      active = false;
      // clearTimeout(undefined) is a documented no-op, so no guard is needed here. The
      // `retryTimer = undefined` reset when the retry fires still matters: it stops this
      // cleanup from clearing a recycled timer id.
      window.clearTimeout(retryTimer);
    };
  }, []);

  const dismiss = () => {
    if (versionInfo?.latestVersion) {
      safeLocalStorageSet(STORAGE_KEY, versionInfo.latestVersion);
      setDismissed(true);
    }
  };

  return {
    versionInfo,
    loading,
    error,
    dismissed,
    dismiss,
  };
}
