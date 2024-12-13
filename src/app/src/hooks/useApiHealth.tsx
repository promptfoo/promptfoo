import { useState } from 'react';
import { callApi } from '@app/utils/api';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked';

interface RemoteHealthResponse {
  status: string;
  remoteVersion?: string;
}

interface ErrorResponse {
  status: 'ERROR';
  error: string;
}

export function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = async () => {
    try {
      const response = await callApi('/remote-health');
      const data = (await response.json()) as RemoteHealthResponse | ErrorResponse;

      if ('error' in data) {
        throw new Error(data.error);
      }

      setStatus(data.status === 'OK' ? 'connected' : 'blocked');
    } catch {
      setStatus('blocked');
    }
    setLastChecked(new Date());
  };

  return {
    status,
    lastChecked,
    checkHealth,
  };
}
