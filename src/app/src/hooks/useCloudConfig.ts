import { useCallback, useEffect, useState } from 'react';

import useApiConfig from '@app/stores/apiConfig';
import { useUserStore } from '@app/stores/userStore';
import { type CloudConfigResponse, CloudConfigResponseSchema } from '@promptfoo/types/api/user';
import { callApi } from '../utils/api';

export type CloudConfigData = CloudConfigResponse;

export interface CloudConfigState {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Loads the local Promptfoo Cloud configuration for links and status UI.
 */
export default function useCloudConfig(): CloudConfigState & { refetch: () => void } {
  const apiBaseUrl = useApiConfig((state) => state.apiBaseUrl);
  const email = useUserStore((state) => state.email);
  const [state, setState] = useState<CloudConfigState>({
    data: null,
    isLoading: true,
    error: null,
  });

  const fetchCloudConfig = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const response = await callApi('/user/cloud-config');
      if (!response.ok) {
        throw new Error('Failed to fetch cloud config');
      }
      const responseResult = CloudConfigResponseSchema.safeParse(await response.json());
      if (!responseResult.success) {
        throw new Error('Invalid cloud config response');
      }
      const responseData = responseResult.data;
      setState({
        data: {
          appUrl: responseData.appUrl,
          isEnabled: responseData.isEnabled,
          isEnterprise: responseData.isEnterprise ?? false,
        },
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh when auth or API target changes
  useEffect(() => {
    fetchCloudConfig();
  }, [apiBaseUrl, email, fetchCloudConfig]);

  return {
    ...state,
    refetch: fetchCloudConfig,
  };
}
