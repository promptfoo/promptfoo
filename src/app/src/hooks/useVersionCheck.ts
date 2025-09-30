import { useEffect } from 'react';
import { useVersionStore } from '@app/stores/versionStore';

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

/**
 * Hook to check for Promptfoo version updates.
 *
 * This hook uses a Zustand store to share state across all components, preventing duplicate
 * API requests when multiple components mount simultaneously.
 */
export function useVersionCheck(): UseVersionCheckResult {
  const { versionInfo, loading, error, dismissed, fetchVersion, dismiss } = useVersionStore();

  useEffect(() => {
    fetchVersion();
  }, [fetchVersion]);

  return {
    versionInfo,
    loading,
    error,
    dismissed,
    dismiss,
  };
}
