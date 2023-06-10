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
} from '@mui/material';
import { Edit, Delete, Publish } from '@mui/icons-material';

import TestCaseDialog from './TestCaseDialog';
import PromptDialog from './PromptDialog';
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

  const [testCaseDialogOpen, setTestCaseDialogOpen] = useState(false);

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
    if (editingPromptIndex !== null && editingPromptIndex > 0 && newPromptInputRef.current) {
      newPromptInputRef.current.focus();
    }
  }, [editingPromptIndex]);

  const handleSubmit = () => {
    const testSuite = {
      description,
      providers,
      prompts,
      tests: testCases,
    };
    onSubmit(testSuite);
    setYamlString(yaml.dump(testSuite));
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

  return (
    <Container maxWidth="lg">
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h4">Configure Test Suite</Typography>
        <Button variant="contained" color="primary" onClick={handleSubmit}>
          Run Test Suite
        </Button>
      </Stack>
      <TextField
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        fullWidth
        margin="normal"
      />
      <FormControl fullWidth margin="normal">
        <InputLabel>Providers</InputLabel>
        <Select
          multiple
          value={providers}
          onChange={(e) => setProviders(e.target.value as string[])}
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
      <Stack direction="row" spacing={2} justifyContent="space-between">
        <Typography variant="h5">Prompts</Typography>
        <div>
          <label htmlFor={`file-input-add-prompt`}>
            <Tooltip title="Upload prompt from file">
              <span>
                <IconButton component="span">
                  <Publish />
                </IconButton>
                <input
                  id={`file-input-add-prompt`}
                  type="file"
                  accept=".txt,.md"
                  onChange={handleAddPromptFromFile}
                  style={{ display: 'none' }}
                />
              </span>
            </Tooltip>
          </label>
          <Button
            color="primary"
            onClick={() => {
              setPrompts([...prompts, '']);
              setEditingPromptIndex(prompts.length);
            }}
            variant="contained"
          >
            Add Prompt
          </Button>
        </div>
      </Stack>
      <TableContainer>
        <Table>
          <TableBody>
            {prompts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  No prompts added yet.
                </TableCell>
              </TableRow>
            ) : (
              prompts.map((prompt, index) => (
                <TableRow key={index}>
                  <TableCell
                    sx={{
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        cursor: 'pointer',
                      },
                    }}
                    onClick={() => handleEditPrompt(index)}
                  >
                    <Typography variant="body2">{`Prompt #${index + 1}: ${
                      prompt.length > 250 ? prompt.slice(0, 250) + ' ...' : prompt
                    }`}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ minWidth: 150 }}>
                    <IconButton onClick={() => handleEditPrompt(index)} size="small">
                      <Edit />
                    </IconButton>
                    <IconButton onClick={() => handleRemovePrompt(index)} size="small">
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <PromptDialog
        open={editingPromptIndex !== null}
        prompt={editingPromptIndex !== null ? prompts[editingPromptIndex] : ''}
        index={editingPromptIndex !== null ? editingPromptIndex : 0}
        onAdd={(newPrompt) => {
          if (editingPromptIndex !== null) {
            handleChangePrompt(editingPromptIndex, newPrompt);
          } else {
            setPrompts([...prompts, newPrompt]);
          }
          setEditingPromptIndex(null);
        }}
        onCancel={() => setEditingPromptIndex(null)}
      />
      <Stack direction="row" spacing={2} marginY={2} justifyContent="space-between">
        <Typography variant="h5">Test Cases</Typography>
        <Button color="primary" onClick={() => setTestCaseDialogOpen(true)} variant="contained">
          Add Test Case
        </Button>
      </Stack>
      <TableContainer>
        <Table>
          <TableBody>
            {testCases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  No test cases added yet.
                </TableCell>
              </TableRow>
            ) : (
              testCases.map((testCase, index) => (
                <TableRow key={index}>
                  <TableCell
                    sx={{
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                        cursor: 'pointer',
                      },
                    }}
                    onClick={() => {
                      setEditingTestCaseIndex(index);
                      setTestCaseDialogOpen(true);
                    }}
                  >
                    <Typography variant="body2">
                      {`Test Case #${index + 1}: ${
                        testCase.description || `${testCase.assert?.length || 0} assertions`
                      }`}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ minWidth: 150 }}>
                    <IconButton
                      onClick={() => {
                        setEditingTestCaseIndex(index);
                        setTestCaseDialogOpen(true);
                      }}
                      size="small"
                    >
                      <Edit />
                    </IconButton>
                    <IconButton onClick={() => handleRemoveTestCase(index)} size="small">
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TestCaseDialog
        open={testCaseDialogOpen}
        onAdd={handleAddTestCase}
        varsList={varsList}
        initialValues={editingTestCaseIndex !== null ? testCases[editingTestCaseIndex] : undefined}
        onCancel={() => {
          setEditingTestCaseIndex(null);
          setTestCaseDialogOpen(false);
        }}
      />
      <Box mt={4}>
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
    </Container>
  );
};

export default EvaluateTestSuiteCreator;
