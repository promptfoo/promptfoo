import React, { useEffect, useState } from 'react';
import { callApi } from '@app/utils/api';
import type { StandaloneEval } from '@promptfoo/util';
import Progress from './Progress';

export default function ProgressPage() {
  const [cols, setCols] = useState<StandaloneEval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await callApi(`/progress`);
        const data = await response.json();
        if (data?.data) {
          setCols(data.data);
        }
      } catch (err) {
        setError('Failed to load progress data. Please try again.');
        console.error('Failed to fetch progress:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return <Progress data={cols} isLoading={isLoading} error={error} />;
}
