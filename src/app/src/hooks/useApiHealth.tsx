import { useState } from 'react';
import { callApi } from '@app/utils/api';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'loading';

interface HealthResponse {
  status: string;
  message: string;
}

export function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>('unknown');
  const [message, setMessage] = useState<string | null>(null);

  const checkHealth = async () => {
    setStatus('loading');
    try {
      const response = await callApi('/remote-health');
      const data = (await response.json()) as HealthResponse;

      setStatus(data.status === 'OK' ? 'connected' : 'blocked');
      setMessage(data.message);
    } catch {
      setStatus('blocked');
      setMessage('Network error: Unable to check API health');
    }
  };

  return { status, message, checkHealth };
}
