import { useState, useEffect, useRef } from 'react';
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
        const response = await callApi('/version');
        if (!response.ok) {
          throw new Error('Failed to fetch version information');
        }
        const data: VersionInfo = await response.json();

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
