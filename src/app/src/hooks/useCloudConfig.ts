import { useCallback, useEffect, useState } from 'react';

import { callApi } from '../utils/api';

interface CloudConfigData {
  appUrl: string;
  isEnabled: boolean;
}

export default function useCloudConfig(): {
  data: CloudConfigData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [data, setData] = useState<CloudConfigData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCloudConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await callApi('/user/cloud-config');
      if (!response.ok) {
        throw new Error('Failed to fetch cloud config');
      }
      const _data = await response.json();
      setData(_data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Error fetching cloud config:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCloudConfig();
  }, [fetchCloudConfig]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchCloudConfig,
  };
}
