import { useCallback, useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';

export interface CloudAuthStatus {
  isAuthenticated: boolean;
  hasApiKey: boolean;
  appUrl: string | null;
  isEnterprise: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useCloudAuth() {
  const [status, setStatus] = useState<CloudAuthStatus>({
    isAuthenticated: false,
    hasApiKey: false,
    appUrl: null,
    isEnterprise: false,
    isLoading: true,
    error: null,
  });

  const checkCloudStatus = useCallback(async () => {
    try {
      setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

      const response = await callApi('/user/cloud/status');

      if (!response.ok) {
        throw new Error('Failed to check cloud status');
      }

      const data = await response.json();

      setStatus({
        isAuthenticated: data.isAuthenticated,
        hasApiKey: data.hasApiKey,
        appUrl: data.appUrl,
        isEnterprise: data.isEnterprise || false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  useEffect(() => {
    checkCloudStatus();
  }, [checkCloudStatus]);

  return {
    ...status,
    refetch: checkCloudStatus,
  };
}
