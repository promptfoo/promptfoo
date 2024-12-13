import { useState, useCallback } from 'react';
import { callApi } from '@app/utils/api';
import { useDebounce } from 'use-debounce';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'loading' | 'disabled';

interface HealthResponse {
  status: string;
  message: string;
}

export function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>('unknown');
  const [message, setMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const performHealthCheck = useCallback(async () => {
    try {
      const response = await callApi('/remote-health');
      const data = (await response.json()) as HealthResponse;

      if (data.status === 'DISABLED') {
        setStatus('disabled');
      } else {
        setStatus(data.status === 'OK' ? 'connected' : 'blocked');
      }
      setMessage(data.message);
    } catch {
      setStatus('blocked');
      setMessage('Network error: Unable to check API health');
    } finally {
      setIsChecking(false);
    }
  }, []);

  const [debouncedHealthCheck] = useDebounce(performHealthCheck, 300);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    setStatus('loading');
    await debouncedHealthCheck();
  }, [debouncedHealthCheck]);

  return { status, message, checkHealth, isChecking };
}
