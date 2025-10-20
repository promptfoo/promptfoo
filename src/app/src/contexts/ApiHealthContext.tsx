import { createContext, useContext, useState } from 'react';
import { callApi } from '@app/utils/api';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'loading' | 'disabled';

export type ApiHealthContext = {
  status: ApiHealthStatus;
  message: string;
  isChecking: boolean;
  checkHealth: () => Promise<void>;
};

const DEFAULT_CONTEXT: ApiHealthContext = {
  status: 'unknown',
  message: '',
  isChecking: false,
  checkHealth: async () => {},
};

export const ApiHealthContext = createContext<ApiHealthContext>(DEFAULT_CONTEXT);

export const useApiHealth = () => {
  // Ensure that the context is initialized
  if (!ApiHealthContext) {
    throw new Error('useApiHealth must be used within an ApiHealthProvider');
  }
  return useContext(ApiHealthContext);
};

export function ApiHealthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ApiHealthStatus>(DEFAULT_CONTEXT.status);
  const [message, setMessage] = useState<string>(DEFAULT_CONTEXT.message);
  const [isChecking, setIsChecking] = useState(DEFAULT_CONTEXT.isChecking);

  const checkHealth = async () => {
    try {
      const response = await callApi('/remote-health');
      const data = (await response.json()) as {
        status: string;
        message: string;
      };

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
  };

  return (
    <ApiHealthContext.Provider value={{ status, message, isChecking, checkHealth }}>
      {children}
    </ApiHealthContext.Provider>
  );
}
