import { useEffect, useRef, useState } from 'react';

import { callApiTyped } from '@app/utils/apiClient';
import type { GetVersionResponse } from '@promptfoo/dtos';

/**
 * Version information from the API.
 * Re-exported from shared DTOs for convenience.
 */
export type VersionInfo = GetVersionResponse;

interface UseVersionCheckResult {
  versionInfo: VersionInfo | null;
  loading: boolean;
  error: Error | null;
  dismissed: boolean;
  dismiss: () => void;
}

const STORAGE_KEY = 'promptfoo:update:dismissedVersion';

export function useVersionCheck(): UseVersionCheckResult {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const checkVersion = async () => {
      try {
        const data = await callApiTyped<VersionInfo>('/version');

        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setVersionInfo(data);

          // Check if this version update was already dismissed
          const dismissedVersion = localStorage.getItem(STORAGE_KEY);
          if (dismissedVersion === data.latestVersion) {
            setDismissed(true);
          }
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

  const dismiss = () => {
    if (versionInfo?.latestVersion) {
      localStorage.setItem(STORAGE_KEY, versionInfo.latestVersion);
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
