import { useCallback, useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import { ApiSchemas } from '@promptfoo/server/apiSchemas';
import z from 'zod';

type ProbeLimit = z.infer<typeof ApiSchemas.User.ProbeLimit.Response>;

export function useProbeLimit() {
  const [probeLimit, setProbeLimit] = useState<ProbeLimit | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProbeLimit = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await callApi('/user/probe-limit');
      if (!response.ok) {
        throw new Error('Failed to fetch probe limit');
      }
      const data: ProbeLimit = await response.json();
      setProbeLimit(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch probe limit';
      setError(errorMessage);
      console.error('Error fetching probe limit:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProbeLimit();
  }, [fetchProbeLimit]);

  return {
    probeLimit,
    isLoading,
    error,
    refetch: fetchProbeLimit,
  };
}
