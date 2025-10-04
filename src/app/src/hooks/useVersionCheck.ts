import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

/**
 * Hook to check for Promptfoo version updates.
 *
 * This hook uses React Query to automatically deduplicate requests and cache results,
 * preventing duplicate API requests when multiple components mount simultaneously.
 */
export function useVersionCheck(): UseVersionCheckResult {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });

  const query = useQuery({
    queryKey: ['version'],
    queryFn: async () => {
      const response = await callApi('/version');
      if (!response.ok) {
        throw new Error('Failed to fetch version information');
      }
      const data: VersionInfo = await response.json();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: import.meta.env.MODE === 'test' ? false : true, // Disable retries in tests
  });

  const dismiss = () => {
    if (query.data?.latestVersion) {
      localStorage.setItem(STORAGE_KEY, query.data.latestVersion);
      setDismissed(query.data.latestVersion);
    }
  };

  return {
    versionInfo: query.data ?? null,
    loading: query.isLoading,
    error: query.error,
    dismissed: dismissed === query.data?.latestVersion,
    dismiss,
  };
}
