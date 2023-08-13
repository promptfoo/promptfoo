'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import yaml from 'js-yaml';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/cjs/styles/hljs';
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
import { useStore } from '../../util/store';

import './page.css';

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
        <ProviderSelector providers={providers} onChange={setProviders} />
      </Box>
      <Box mt={4} />
      <PromptsSection />
      <Box mt={6} />
      <TestCasesSection varsList={varsList} />
      <Box mt={8}>
        {yamlString && (
          <Box mt={4}>
            <Typography variant="h5" gutterBottom>
              YAML config
            </Typography>
            <Typography variant="body1" gutterBottom>
              This is the evaluation config that is run by promptfoo. See{' '}
              <Link href="https://promptfoo.dev/docs/configuration/guide">configuration docs</Link>{' '}
              to learn more.
            </Typography>
            <SyntaxHighlighter className="yaml-config" language="yaml" style={docco}>
              {yamlString}
            </SyntaxHighlighter>
          </Box>
        )}
      </Box>
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
