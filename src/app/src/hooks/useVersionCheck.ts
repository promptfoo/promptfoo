import { useState, useMemo } from 'react';
import { callApi } from '@app/utils/api';
import { useQuery } from '@tanstack/react-query';

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
  const [dismissed, setDismissed] = useState(false);

  const query = useQuery<VersionInfo, Error>({
    queryKey: ['versionCheck'],
    queryFn: async () => {
      const response = await callApi('/version');
      if (!response.ok) {
        throw new Error('Failed to fetch version information');
      }
      return await response.json();
    },
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes (version doesn't change often)
  });

  // Check if this version was dismissed (computed from localStorage + query data)
  const isDismissed = useMemo(() => {
    if (dismissed) return true;
    if (!query.data?.latestVersion) return false;

    const dismissedVersion = localStorage.getItem(STORAGE_KEY);
    return dismissedVersion === query.data.latestVersion;
  }, [dismissed, query.data?.latestVersion]);

  const dismiss = () => {
    if (query.data?.latestVersion) {
      localStorage.setItem(STORAGE_KEY, query.data.latestVersion);
      setDismissed(true);
    }
  };

  return {
    versionInfo: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    dismissed: isDismissed,
    dismiss,
  };
}
