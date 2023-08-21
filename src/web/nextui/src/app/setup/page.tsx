'use client';

import React, { useState, useEffect } from 'react';
import yaml from 'js-yaml';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';

import RunTestSuiteButton from './RunTestSuiteButton';
import PromptsSection from './PromptsSection';
import TestCasesSection from './TestCasesSection';
import ProviderSelector from './ProviderSelector';
import YamlEditor from './YamlEditor';
import { useStore } from '../../util/store';

import type {ProviderOptions, TestCase, TestSuiteConfig} from '../eval/types';

import './page.css';

export type WebTestSuiteConfig = TestSuiteConfig & {providers: ProviderOptions[], prompts: string[], tests: TestCase[]};

const EvaluateTestSuiteCreator: React.FC = () => {
  const [yamlString, setYamlString] = useState('');
  const [resetDialogOpen, setResetDialogOpen] = useState(false);

  const {
    description,
    setDescription,
    providers,
    setProviders,
    prompts,
    setPrompts,
    testCases,
    setTestCases,
  } = useStore();

  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    const testSuite = {
      description,
      providers,
      prompts,
      tests: testCases,
    };
    setYamlString(yaml.dump(testSuite));
  }, [description, providers, prompts, testCases]);

  if (process.env.NEXT_PUBLIC_NO_BROWSING) {
    return null;
  }

  const extractVarsFromPrompts = (prompts: string[]): string[] => {
    const varRegex = /{{(\w+)}}/g;
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
    setYamlString('');
    setResetDialogOpen(false);
  };

  const handleTestSuiteUpdated = (testSuite: WebTestSuiteConfig) => {
    setDescription(testSuite.description || '');
    setProviders(testSuite.providers || []);
    setPrompts(testSuite.prompts || []);
    setTestCases(testSuite.tests || []);
  };

  return (
    <Container maxWidth="lg" sx={{ marginTop: '2rem' }}>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h4">Set up an evaluation</Typography>
        <Stack direction="row" spacing={2}>
          <RunTestSuiteButton />
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
        <Stack direction="column" spacing={2} justifyContent="space-between">
          <Typography variant="h5">Providers</Typography>
          <ProviderSelector providers={providers} onChange={setProviders} />
        </Stack>
      </Box>
      <Box mt={4} />
      import { ErrorBoundary } from 'react-error-boundary';

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <PromptsSection />
      </ErrorBoundary>
      <Box mt={6} />
      <TestCasesSection varsList={varsList} />
      <YamlEditor yamlString={yamlString} onTestSuiteUpdated={handleTestSuiteUpdated} />
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
function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button onClick={resetErrorBoundary}>Try again</button>
    </div>
  )
}
