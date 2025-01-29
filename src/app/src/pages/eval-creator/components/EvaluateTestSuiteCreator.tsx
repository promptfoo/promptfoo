import React, { useState, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { ProviderOptions, TestCase, TestSuiteConfig } from '@app/pages/eval/components/types';
import { useStore } from '@app/stores/evalConfig';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ConfigureEnvButton from './ConfigureEnvButton';
import PromptsSection from './PromptsSection';
import ProviderSelector from './ProviderSelector';
import RunTestSuiteButton from './RunTestSuiteButton';
import TestCasesSection from './TestCasesSection';
import YamlEditor from './YamlEditor';
import './EvaluateTestSuiteCreator.css';

export type WebTestSuiteConfig = TestSuiteConfig & {
  providers: ProviderOptions[];
  prompts: string[];
  tests: TestCase[];
};

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  );
}

const EvaluateTestSuiteCreator: React.FC = () => {
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const { setDescription, providers, setProviders, prompts, setPrompts, setTestCases } = useStore();

  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);

  const extractVarsFromPrompts = (prompts: string[]): string[] => {
    const varRegex = /{{\s*(\w+)\s*}}/g;
    const varsSet = new Set<string>();

    prompts.forEach((prompt) => {
      let match;
      while ((match = varRegex.exec(prompt)) !== null) {
        varsSet.add(match[1]);
      }
    });

    return Array.from(varsSet);
  };

  const varsList = extractVarsFromPrompts(prompts);

  const handleReset = () => {
    setDescription('');
    setProviders([]);
    setPrompts([]);
    setTestCases([]);
    setResetDialogOpen(false);
  };

  return (
    <Container maxWidth="lg" sx={{ marginTop: '2rem' }}>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h4">Set up an evaluation</Typography>
        <Stack direction="row" spacing={2}>
          <RunTestSuiteButton />
          <ConfigureEnvButton />
          <Button variant="outlined" color="primary" onClick={() => setResetDialogOpen(true)}>
            Reset
          </Button>
        </Stack>
      </Stack>
      <Box mt={4} />
      {/*
      <Box mt={4}>
        <TextField
          label="Description"
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          fullWidth
          margin="normal"
        />
      </Box>
      */}
      <Box mt={2}>
        <ErrorBoundary
          FallbackComponent={ErrorFallback}
          onReset={() => {
            setProviders([]);
          }}
        >
          <Stack direction="column" spacing={2} justifyContent="space-between">
            <Typography variant="h5">Providers</Typography>
            <ProviderSelector providers={providers} onChange={setProviders} />
          </Stack>
        </ErrorBoundary>
      </Box>
      <Box mt={4} />
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={() => {
          setPrompts([]);
        }}
      >
        <PromptsSection />
      </ErrorBoundary>
      <Box mt={6} />
      <ErrorBoundary
        FallbackComponent={ErrorFallback}
        onReset={() => {
          setTestCases([]);
        }}
      >
        <TestCasesSection varsList={varsList} />
      </ErrorBoundary>
      <YamlEditor />
      <Dialog
        open={resetDialogOpen}
        onClose={() => setResetDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{'Confirm Reset'}</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to reset all the fields? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleReset} autoFocus>
            Reset
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default EvaluateTestSuiteCreator;
