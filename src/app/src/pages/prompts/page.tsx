import React from 'react';
import { usePageMeta } from '@app/hooks/usePageMeta';
import Container from '@mui/material/Container';
import PromptList from './PromptList';

export default function PromptsPage() {
  usePageMeta({
    title: 'Prompts',
    description: 'Manage prompt templates with versioning and deployment',
  });

  return (
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <PromptList onPromptSelect={(promptId) => window.location.href = `/prompts/${promptId}/edit`} />
    </Container>
  );
}
