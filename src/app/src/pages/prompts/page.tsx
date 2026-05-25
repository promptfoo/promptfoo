import { useEffect, useState } from 'react';

import { usePageMeta } from '@app/hooks/usePageMeta';
import { callApiJson } from '@app/utils/api';
import { ApiRoutes } from '@promptfoo/types/api/routes';
import { ServerSchemas } from '@promptfoo/types/api/server';
import ErrorBoundary from '../../components/ErrorBoundary';
import Prompts from './Prompts';
import type { ServerPromptWithMetadata } from '@promptfoo/types';

interface PromptsPageProps {
  showDatasetColumn?: boolean;
}

function PromptsPageContent({ showDatasetColumn = true }: PromptsPageProps) {
  const [prompts, setPrompts] = useState<ServerPromptWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrompts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await callApiJson(ApiRoutes.Prompts.List, ServerSchemas.Prompts.Response);
        if (data?.data) {
          setPrompts(data.data as ServerPromptWithMetadata[]);
        }
      } catch (error) {
        setError('Failed to load prompts. Please try again.');
        console.error('Failed to fetch prompts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
  }, []);

  return (
    <Prompts
      data={prompts}
      isLoading={isLoading}
      error={error}
      showDatasetColumn={showDatasetColumn}
    />
  );
}

export default function PromptsPage({ showDatasetColumn = true }: PromptsPageProps) {
  usePageMeta({ title: 'Prompts', description: 'Saved prompt templates' });
  return (
    <ErrorBoundary name="Prompts Page">
      <PromptsPageContent showDatasetColumn={showDatasetColumn} />
    </ErrorBoundary>
  );
}
