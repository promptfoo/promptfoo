import React, { useState, useRef, useEffect } from 'react';
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
  IconButton,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Stack,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { Edit, Delete, Publish } from '@mui/icons-material';

import TestCaseDialog from './TestCaseDialog';
import PromptsSection from './PromptsSection';
import TestCasesSection from './TestCasesSection';
import { useStore } from '../../util/store';

import type { TestSuiteConfig } from '../../../../types';
import type { TestCase } from '../../../../types';

interface EvaluateTestSuite extends TestSuiteConfig {
  prompts: string[];
}

interface EvaluateTestSuiteCreatorProps {
  onSubmit: (testSuite: EvaluateTestSuite) => void;
}

const providerOptions = ['openai:gpt-3.5-turbo', 'openai:gpt-4', 'localai:chat:vicuna'];

const EvaluateTestSuiteCreator: React.FC<EvaluateTestSuiteCreatorProps> = ({ onSubmit }) => {
  const [yamlString, setYamlString] = useState('');
  const [editingTestCaseIndex, setEditingTestCaseIndex] = useState<number | null>(null);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);
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
  const newPromptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (editingPromptIndex !== null && editingPromptIndex > 0 && newPromptInputRef.current) {
      newPromptInputRef.current.focus();
    }
  }, [editingPromptIndex]);

  useEffect(() => {
    const testSuite = {
      description,
      providers,
      prompts,
      tests: testCases,
    };
    setYamlString(yaml.dump(testSuite));
  }, [description, providers, prompts, testCases]);

  const handleSubmit = () => {
    const testSuite = {
      description,
      providers,
      prompts,
      tests: testCases,
    };
    onSubmit(testSuite);
  };

  const handleAddTestCase = (testCase: TestCase, shouldClose: boolean) => {
    if (editingTestCaseIndex === null) {
      setTestCases([...testCases, testCase]);
    } else {
      const updatedTestCases = testCases.map((tc, index) =>
        index === editingTestCaseIndex ? testCase : tc,
      );
      setTestCases(updatedTestCases);
      setEditingTestCaseIndex(null);
    }

    if (shouldClose) {
      setTestCaseDialogOpen(false);
    }
  };

  const handleEditPrompt = (index: number) => {
    setEditingPromptIndex(index);
    setPromptDialogOpen(true);
  };

  const handleAddPromptFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.stopPropagation();
    event.preventDefault();

    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result?.toString();
        if (text) {
          setPrompts([...prompts, text]);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleChangePrompt = (index: number, newPrompt: string) => {
    setPrompts(prompts.map((p, i) => (i === index ? newPrompt : p)));
  };

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

  const handleRemovePrompt = (indexToRemove: number) => {
    setPrompts(prompts.filter((_, index) => index !== indexToRemove));
  };

  const handleRemoveTestCase = (indexToRemove: number) => {
    setTestCases(testCases.filter((_, index) => index !== indexToRemove));
  };

  const handleReset = () => {
    setDescription('');
    setProviders([]);
    setPrompts([]);
    setTestCases([]);
    setYamlString('');
    setResetDialogOpen(false);
  };

  return (
    <Container maxWidth="lg">
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h4">Configure Test Suite</Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" color="primary" onClick={handleSubmit}>
            Run Test Suite
          </Button>
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
          <InputLabel>Providers</InputLabel>
          <Select
            multiple
            value={providers}
            onChange={(e) => {
              setProviders(e.target.value as string[]);
            }}
            renderValue={(selected) => (
              <div>
                {(selected as string[]).map((value) => (
                  <Chip key={value} label={value} />
                ))}
              </div>
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
      <TestCasesSection
        testCases={testCases}
        varsList={varsList}
        editingTestCaseIndex={editingTestCaseIndex}
        setEditingTestCaseIndex={setEditingTestCaseIndex}
        handleAddTestCase={handleAddTestCase}
        handleRemoveTestCase={handleRemoveTestCase}
      />
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
        <DialogTitle id="alert-dialog-title">{"Confirm Reset"}</DialogTitle>
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
