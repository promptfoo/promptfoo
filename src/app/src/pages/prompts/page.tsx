import { useCallback, useEffect, useState } from 'react';

import { IS_RUNNING_LOCALLY } from '@app/constants';
import { usePageMeta } from '@app/hooks/usePageMeta';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import { io as SocketIOClient } from 'socket.io-client';
import ErrorBoundary from '../../components/ErrorBoundary';
import Prompts from './Prompts';
import type { ServerPromptWithMetadata } from '@promptfoo/types';

interface PromptsPageProps {
  showDatasetColumn?: boolean;
}

function PromptsPageContent({ showDatasetColumn = true }: PromptsPageProps) {
  const { apiBaseUrl } = useApiConfig();
  const [prompts, setPrompts] = useState<ServerPromptWithMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrompts = useCallback(async (isBackgroundUpdate = false) => {
    if (!isBackgroundUpdate) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const response = await callApi('/prompts');
      const data = await response.json();
      if (data?.data) {
        setPrompts(data.data);
      }
    } catch (error) {
      setError('Failed to load prompts. Please try again.');
      console.error('Failed to fetch prompts:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrompts();

    // Subscribe to real-time updates when running locally
    if (IS_RUNNING_LOCALLY) {
      const socket = SocketIOClient(apiBaseUrl || '');

      socket.on('update', () => {
        // Refetch prompts when any eval is updated
        fetchPrompts(true);
      });

      return () => {
        socket.disconnect();
      };
    }
  }, [apiBaseUrl, fetchPrompts]);

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
