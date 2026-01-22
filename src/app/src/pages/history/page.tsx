import { useEffect, useState } from 'react';

import { useEvalHistoryRefresh } from '@app/hooks/useEvalHistoryRefresh';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { callApi } from '@app/utils/api';
import ErrorBoundary from '../../components/ErrorBoundary';
import History from './History';
import type { StandaloneEval } from '@promptfoo/util/database';

interface HistoryPageProps {
  showDatasetColumn?: boolean;
}

function HistoryPageContent({ showDatasetColumn = true }: HistoryPageProps) {
  const [cols, setCols] = useState<StandaloneEval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastEvalCompletedAt } = useEvalHistoryRefresh();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally refetch when lastEvalCompletedAt changes
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
  }, [lastEvalCompletedAt]);

  return (
    <History
      data={cols}
      isLoading={isLoading}
      error={error}
      showDatasetColumn={showDatasetColumn}
    />
  );
}

export default function HistoryPage({ showDatasetColumn = true }: HistoryPageProps) {
  usePageMeta({ title: 'History', description: 'Evaluation history' });

  return (
    <ErrorBoundary name="History Page">
      <HistoryPageContent showDatasetColumn={showDatasetColumn} />
    </ErrorBoundary>
  );
}
