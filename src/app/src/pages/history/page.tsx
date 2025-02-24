import React, { useEffect, useState } from 'react';
import { callApi } from '@app/utils/api';
import type { StandaloneEval } from '@promptfoo/util';
import History from './History';

export default function HistoryPage() {
  const [cols, setCols] = useState<StandaloneEval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await callApi(`/history`);
        const data = await response.json();
        if (data?.data) {
          setCols(data.data);
        }
      } catch (err) {
        setError('Failed to load history data. Please try again.');
        console.error('Failed to fetch history:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return <History data={cols} isLoading={isLoading} error={error} />;
}
