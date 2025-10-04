import { useQuery } from '@tanstack/react-query';
import { callApi } from '@app/utils/api';

type CloudConfigData = {
  appUrl: string;
  isEnabled: boolean;
};

/**
 * Loads the current user's cloud config from the API. Useful for getting the Cloud app's URL
 * in order to redirect the user to something in Cloud.
 *
 * This hook uses React Query to automatically deduplicate requests and cache results,
 * preventing duplicate API requests when multiple components mount simultaneously.
 */
export default function useCloudConfig(): {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const query = useQuery({
    queryKey: ['cloudConfig'],
    queryFn: async () => {
      const response = await callApi('/user/cloud-config');
      if (!response.ok) {
        throw new Error('Failed to fetch cloud config');
      }
      const responseData = await response.json();

      // Validate data structure
      if (
        typeof responseData === 'object' &&
        responseData !== null &&
        typeof responseData.appUrl === 'string' &&
        typeof responseData.isEnabled === 'boolean'
      ) {
        return responseData as CloudConfigData;
      }
      throw new Error('Cloud config data is malformed');
    },
    staleTime: Infinity, // Cache forever until explicitly invalidated
    retry: false, // Don't retry on error (same as Zustand version)
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error?.message ?? null,
    refetch: query.refetch,
  };
}
