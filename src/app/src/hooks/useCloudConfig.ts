import { useCallback, useEffect, useState } from 'react';

import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '../utils/api';
import type { CloudConfigResponse } from '@promptfoo/types/api/user';

const CLOUD_CONFIG_UPDATED_EVENT = 'promptfoo:cloud-config-updated';

export function notifyCloudConfigUpdated(): void {
  window.dispatchEvent(new Event(CLOUD_CONFIG_UPDATED_EVENT));
}

function getBrowserSafeAppUrl(appUrl: unknown): string | null {
  if (typeof appUrl !== 'string') {
    return null;
  }

  try {
    const parsedUrl = new URL(appUrl);
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return null;
    }
    return appUrl;
  } catch {
    return null;
  }
}

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
          appUrl: getBrowserSafeAppUrl(responseData.appUrl),
          isEnabled: responseData.isEnabled === true,
          isEnterprise: responseData.isEnterprise === true,
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
    const handleCloudConfigUpdated = () => {
      fetchCloudConfig();
    };
    const unsubscribeFromApiConfig = useApiConfig.subscribe((current, previous) => {
      if (current.apiBaseUrl !== previous.apiBaseUrl) {
        fetchCloudConfig();
      }
    });
    window.addEventListener(CLOUD_CONFIG_UPDATED_EVENT, handleCloudConfigUpdated);
    return () => {
      unsubscribeFromApiConfig();
      window.removeEventListener(CLOUD_CONFIG_UPDATED_EVENT, handleCloudConfigUpdated);
    };
  }, [fetchCloudConfig]);

  return {
    ...state,
    refetch: fetchCloudConfig,
  };
}
