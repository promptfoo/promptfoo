import { useEffect, useState } from 'react';

import { callApiTyped } from '../utils/apiClient';
import type { GetCloudConfigResponse } from '@promptfoo/dtos';

/**
 * Cloud config data type.
 * Re-exported from shared DTOs for convenience.
 */
export type CloudConfigData = GetCloudConfigResponse;

/**
 * Loads the current user's cloud config from the API. Useful for getting the Cloud app's URL
 * in order to redirect the user to something in Cloud.
 */
export default function useCloudConfig(): {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<CloudConfigData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches the cloud config from the API.
   */
  const fetchCloudConfig = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const responseData = await callApiTyped<CloudConfigData>('/user/cloud-config');
      setData(responseData);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching cloud config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetch on mount.
   */
  useEffect(() => {
    fetchCloudConfig();
  }, []);

  return {
    data,
    isLoading,
    error,
    refetch: fetchCloudConfig,
  };
}
