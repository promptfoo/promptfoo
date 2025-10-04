import { useEffect } from 'react';
import { useCloudConfigStore } from '../stores/cloudConfigStore';

type CloudConfigData = {
  appUrl: string;
  isEnabled: boolean;
};

/**
 * Loads the current user's cloud config from the API. Useful for getting the Cloud app's URL
 * in order to redirect the user to something in Cloud.
 *
 * This hook uses a Zustand store to share state across all components, preventing duplicate
 * API requests when multiple components mount simultaneously.
 */
export default function useCloudConfig(): {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const { data, isLoading, error, fetchCloudConfig, refetch } = useCloudConfigStore();

  /**
   * Fetch on mount if not already loaded.
   */
  useEffect(() => {
    fetchCloudConfig();
  }, [fetchCloudConfig]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}
