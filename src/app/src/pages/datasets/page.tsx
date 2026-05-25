import { useEffect, useState } from 'react';

import { usePageMeta } from '@app/hooks/usePageMeta';
import { callApiJson } from '@app/utils/api';
import { ApiRoutes } from '@promptfoo/types/api/routes';
import { ServerSchemas } from '@promptfoo/types/api/server';
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
        const data = await callApiJson(ApiRoutes.Datasets, ServerSchemas.Datasets.Response);
        if (data?.data) {
          setTestCases(data.data as (TestCasesWithMetadata & { recentEvalDate: string })[]);
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
