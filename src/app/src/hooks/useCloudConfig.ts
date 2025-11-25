import { useCallback, useEffect, useState } from 'react';

import { callApi } from '../utils/api';

export type CloudConfigData = {
  appUrl: string | null;
  /** Whether the user is authenticated to Promptfoo Cloud */
  isEnabled: boolean;
  /** Whether this is an enterprise/self-hosted deployment (non-promptfoo.app domain) */
  isEnterprise: boolean;
};

export interface CloudConfigState {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Loads the current user's cloud config from the API. Useful for:
 * - Checking if user is connected to Promptfoo Cloud
 * - Getting the Cloud app's URL for redirects and links
 * - Detecting enterprise/self-hosted deployments
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

      const response = await callApi('/user/cloud/status');

      if (!response.ok) {
        throw new Error('Failed to fetch cloud config');
      }

      const responseData = await response.json();

      setState({
        data: {
          appUrl: responseData.appUrl,
          // Map isAuthenticated to isEnabled for backwards compatibility
          isEnabled: responseData.isAuthenticated,
          isEnterprise: responseData.isEnterprise || false,
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
