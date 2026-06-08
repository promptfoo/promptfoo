import { useEffect, useState } from 'react';

import { ApiRoutes, UserSchemas } from '@app/utils/api';
import { callApiJson } from '../utils/api';

export type CloudConfigData = {
  appUrl: string;
  isEnabled: boolean;
};

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
      const responseData = await callApiJson(
        ApiRoutes.User.CloudConfig,
        UserSchemas.CloudConfig.Response,
      );
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
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
