import { useState } from 'react';
import { useToast } from './useToast';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked';

export function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = async () => {
    try {
      const response = await fetch('https://api.promptfoo.app/health');
      const data = await response.json();
      if (data.status !== 'OK2') {
        throw new Error('API health check failed');
      }
      setStatus('connected');
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
