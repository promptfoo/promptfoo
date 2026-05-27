import { useCallback, useEffect, useState } from 'react';

import { callApi } from '../utils/api';
import type { CloudConfigResponse } from '@promptfoo/types/api/user';

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
      const responseData: CloudConfigResponse = await response.json();
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

  useEffect(() => {
    fetchCloudConfig();
  }, [fetchCloudConfig]);

  return {
    ...state,
    refetch: fetchCloudConfig,
  };
}
