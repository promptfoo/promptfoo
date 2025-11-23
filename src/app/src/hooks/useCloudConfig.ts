import { callApi } from '../utils/api';
import { useQuery } from '@tanstack/react-query';

export type CloudConfigData = {
  appUrl: string;
  isEnabled: boolean;
};

/**
 * Loads the current user's cloud config from the API. Useful for getting the Cloud app's URL
 * in order to redirect the user to something in Cloud.
 */
export default function useCloudConfig() {
  const query = useQuery<CloudConfigData, Error>({
    queryKey: ['cloudConfig'],
    queryFn: async () => {
      const response = await callApi('/user/cloud-config');
      if (!response.ok) {
        throw new Error('Failed to fetch cloud config');
      }
      return await response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (config doesn't change often)
    // retry defaults to 2 in production, can be configured via QueryClient in tests
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
