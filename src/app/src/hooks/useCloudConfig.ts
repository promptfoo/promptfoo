import useApiConfig from '@app/stores/apiConfig';
import { useUserStore } from '@app/stores/userStore';
import {
  type CloudConfigResponse,
  CloudConfigResponseSchema,
  isHostedCloudHost,
} from '@promptfoo/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callApi, getApiBaseUrl } from '../utils/api';

export type CloudConfigData = CloudConfigResponse;

/** Loads cloud configuration shared by consumers of the same endpoint and session. */
export default function useCloudConfig(): {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const endpoint = getApiBaseUrl(useApiConfig((state) => state.apiBaseUrl));
  const authVersion = useUserStore((state) => state.authVersion);
  const queryKey = ['cloud-config', endpoint, authVersion];
  const client = useQueryClient();
  const query = useQuery<CloudConfigData>({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        const response = await callApi('/user/cloud-config', { signal }, endpoint);
        if (!response.ok) {
          throw new Error('Failed to fetch cloud config');
        }
        const data = CloudConfigResponseSchema.parse(await response.json());
        return {
          ...data,
          isEnterprise:
            data.isEnterprise ?? (data.appUrl !== null && !isHostedCloudHost(data.appUrl)),
        };
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
    refetch: () => {
      // Explicit refresh must supersede even an initial request without cached data.
      void client.cancelQueries({ queryKey, exact: true });
      void query.refetch();
    },
  };
}
