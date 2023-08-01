import React, { useState, useEffect } from 'react';
import yaml from 'js-yaml';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import { docco } from 'react-syntax-highlighter/dist/cjs/styles/hljs';
import {
  Button,
  Container,
  TextField,
  Typography,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Box,
  Stack,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';

import RunTestSuiteButton from './RunTestSuiteButton';
import PromptsSection from './PromptsSection';
import TestCasesSection from './TestCasesSection';
import { useStore } from '../../util/store';

const providerOptions = ['openai:gpt-3.5-turbo', 'openai:gpt-4', 'localai:chat:vicuna'];

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
    <Container maxWidth="lg" sx={{marginTop: '2rem'}}>
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h4">Configure Test Suite</Typography>
        <Stack direction="row" spacing={2}>
          <RunTestSuiteButton />
          <Button variant="outlined" color="primary" onClick={() => setResetDialogOpen(true)}>
            Reset
          </Button>
        </Stack>
      </Stack>
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
      <Box mt={2}>
        <FormControl fullWidth margin="normal">
          <InputLabel id="providers-select-label">Providers</InputLabel>
          <Select
            labelId="providers-select-label"
            label="Providers"
            multiple
            value={providers}
            onChange={(e) => {
              setProviders(e.target.value as string[]);
            }}
            renderValue={(selected) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {(selected as string[]).map((value) => (
                  <Chip key={value} label={value} />
                ))}
              </Box>
            )}
          >
            {providerOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
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
            <SyntaxHighlighter language="yaml" style={docco}>
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
