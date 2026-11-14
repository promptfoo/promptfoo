import useApiConfig from '@app/stores/apiConfig';
import { useUserStore } from '@app/stores/userStore';
import { useQuery } from '@tanstack/react-query';
import { callApi, getApiBaseUrl } from '../utils/api';

export type CloudConfigData = {
  appUrl: string;
  isEnabled: boolean;
};

/** Loads cloud configuration shared by consumers of the same endpoint and session. */
export default function useCloudConfig(): {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
} {
  const endpoint = getApiBaseUrl(useApiConfig((state) => state.apiBaseUrl));
  const authVersion = useUserStore((state) => state.authVersion);
  const queryKey = ['cloud-config', endpoint, authVersion];
  const query = useQuery<CloudConfigData>({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        const response = await callApi('/user/cloud-config', { signal }, endpoint);
        if (!response.ok) {
          throw new Error('Failed to fetch cloud config');
        }
        return await response.json();
      } catch (error) {
        if (!signal.aborted) {
          console.error('Error fetching cloud config:', error);
        }
        throw error;
      }
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    networkMode: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isFetching,
    error:
      query.isFetching || !query.isError
        ? null
        : query.error instanceof Error
          ? query.error.message
          : 'Unknown error',
  };
}
