import { useCallback, useEffect, useState } from 'react';

import { IS_RUNNING_LOCALLY } from '@app/constants';
import { usePageMeta } from '@app/hooks/usePageMeta';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import { io as SocketIOClient } from 'socket.io-client';
import ErrorBoundary from '../../components/ErrorBoundary';
import Prompts from './Prompts';
import type { ServerPromptWithMetadata } from '@promptfoo/types';

function getSocketConfig(apiBaseUrl?: string) {
  let socketPath = '/socket.io';
  let socketUrl = '';

  if (apiBaseUrl) {
    try {
      const url = new URL(apiBaseUrl, window.location.origin);
      const isSameOrigin = url.origin === window.location.origin;
      if (isSameOrigin && url.pathname !== '/') {
        socketPath = `${url.pathname.replace(/\/$/, '')}/socket.io`;
      }
      socketUrl = isSameOrigin ? '' : apiBaseUrl;
    } catch {
      // Invalid API base URLs fall back to same-origin defaults.
    }
  } else {
    const basePath = import.meta.env.VITE_PUBLIC_BASENAME || '';
    if (basePath) {
      socketPath = `${basePath}/socket.io`;
    }
  }

  return { socketPath, socketUrl };
}

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
      if (!isBackgroundUpdate) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchPrompts();

    // Subscribe to real-time updates when running locally
    if (IS_RUNNING_LOCALLY) {
      const { socketPath, socketUrl } = getSocketConfig(apiBaseUrl);
      const socket = SocketIOClient(socketUrl, { path: socketPath });

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
