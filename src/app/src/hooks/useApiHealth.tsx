import { useState } from 'react';
import dedent from 'dedent';
import { useToast } from './useToast';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked';

export function useApiHealth() {
  const [status, setStatus] = useState<ApiHealthStatus>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const { showToast } = useToast();

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
      showToast(
        dedent`
          Cannot connect to promptfoo API (api.promptfoo.app). This may affect sharing and cloud features. Common causes:
          • Corporate firewall blocking the connection
          • VPN or proxy restrictions 
          • Network connectivity issues

          Please check your network settings or contact your IT department.
        `,
        'error',
      );
    }
    setLastChecked(new Date());
  };

  return {
    status,
    lastChecked,
    checkHealth,
  };
}
