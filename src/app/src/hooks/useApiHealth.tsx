import { useState, useCallback, useEffect } from 'react';
import { callApi } from '@app/utils/api';
import { useDebounce } from 'use-debounce';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'loading' | 'disabled';

interface HealthResponse {
  status: string;
  message: string;
}

const CONNECTION_STATE_KEY = 'promptfoo_connection_state';

interface ConnectionState {
  hasBeenConnected: boolean;
  lastConnectedAt?: number;
}

function getStoredConnectionState(): ConnectionState {
  try {
    const stored = localStorage.getItem(CONNECTION_STATE_KEY);
    return stored ? JSON.parse(stored) : { hasBeenConnected: false };
  } catch {
    return { hasBeenConnected: false };
  }
}

function updateStoredConnectionState(state: ConnectionState) {
  localStorage.setItem(CONNECTION_STATE_KEY, JSON.stringify(state));
}

export function useApiHealth(enableKeepalive = false, interval = 10000, baseUrlOverride?: string) {
  const [status, setStatus] = useState<ApiHealthStatus>('unknown');
  const [message, setMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>(getStoredConnectionState);
  const [isInitialConnection, setIsInitialConnection] = useState(!connectionState.hasBeenConnected);

  const performHealthCheck = useCallback(async () => {
    try {
      const response = await callApi('/remote-health', {}, baseUrlOverride);
      const data = (await response.json()) as HealthResponse;

      if (data.status === 'DISABLED') {
        setStatus('disabled');
      } else {
        const isConnected = data.status === 'OK';
        setStatus(isConnected ? 'connected' : 'blocked');
        if (isConnected) {
          const newState = {
            hasBeenConnected: true,
            lastConnectedAt: Date.now(),
          };
          setConnectionState(newState);
          updateStoredConnectionState(newState);
          setIsInitialConnection(false);
        }
      }
      setMessage(data.message);
    } catch {
      setStatus('blocked');
      setMessage('Network error: Unable to check API health');
    } finally {
      setIsChecking(false);
    }
  }, [baseUrlOverride]);

  const [debouncedHealthCheck] = useDebounce(performHealthCheck, 300);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    setStatus('loading');
    await debouncedHealthCheck();
  }, [debouncedHealthCheck]);

  useEffect(() => {
    if (enableKeepalive) {
      checkHealth(); // Initial check
      const keepaliveInterval = setInterval(checkHealth, interval);
      return () => clearInterval(keepaliveInterval);
    }
  }, [enableKeepalive, interval, checkHealth]);

  return {
    status,
    message,
    checkHealth,
    isChecking,
    hasBeenConnected: connectionState.hasBeenConnected,
    isInitialConnection,
    lastConnectedAt: connectionState.lastConnectedAt,
  };
}
