import React, { useEffect, useState } from 'react';
import { callApi } from '@app/utils/api';
import type { PromptWithMetadata } from '@promptfoo/types';
import Prompts from './Prompts';

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<(PromptWithMetadata & { recentEvalDate: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrompts = async () => {
      setIsLoading(true);
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
    };

    fetchPrompts();
  }, []);

  return <Prompts data={prompts} isLoading={isLoading} error={error} />;
}
