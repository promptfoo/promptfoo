import { useEffect, useState } from 'react';

import { usePageMeta } from '@app/hooks/usePageMeta';
import { callApi } from '@app/utils/api';
import ErrorBoundary from '../../components/ErrorBoundary';
import Datasets from './Datasets';
import type { TestCasesWithMetadata } from '@promptfoo/types';

function DatasetsPageContent() {
  const [testCases, setTestCases] = useState<
    (TestCasesWithMetadata & { recentEvalDate: string })[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDatasets = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await callApi('/datasets');
        const data = await response.json();
        if (data?.data) {
          setTestCases(data.data);
        }
      } catch (error) {
        setError('Failed to load datasets. Please try again.');
        console.error('Failed to fetch datasets:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDatasets();
  }, []);

  return <Datasets data={testCases} isLoading={isLoading} error={error} />;
}

export default function DatasetsPage() {
  usePageMeta({ title: 'Datasets', description: 'Prompt test case collections' });
  return (
    <ErrorBoundary name="Datasets Page">
      <DatasetsPageContent />
    </ErrorBoundary>
  );
}
