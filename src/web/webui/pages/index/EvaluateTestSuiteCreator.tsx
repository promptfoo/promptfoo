import React, { useState } from 'react';
import { Button, Container, TextField, Typography, MenuItem, FormControl, InputLabel, Select, Chip, IconButton, Box } from '@mui/material';
import { Edit, Delete, Save } from '@mui/icons-material';
import TestCaseForm from './TestCaseForm';
import type { TestSuiteConfig } from '../../../../types';
import type { TestCase } from '../../../../types';

interface EvaluateTestSuite extends TestSuiteConfig {
  prompts: string[];
}

interface EvaluateTestSuiteCreatorProps {
  onSubmit: (testSuite: EvaluateTestSuite) => void;
}

const providerOptions = [
  'openai:gpt-3.5-turbo',
  'openai:gpt-4',
  'localai:chat:vicuna',
];

const EvaluateTestSuiteCreator: React.FC<EvaluateTestSuiteCreatorProps> = ({
  onSubmit,
}) => {
  const [description, setDescription] = useState('');
  const [providers, setProviders] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<string[]>(['']);

  const handleSubmit = () => {
    onSubmit({
      description,
      providers,
      prompts,
      tests: testCases,
    });
  };

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [editingTestCaseIndex, setEditingTestCaseIndex] = useState<number | null>(null);
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null);

  const handleAddTestCase = (testCase: TestCase) => {
    if (editingTestCaseIndex === null) {
      setTestCases([...testCases, testCase]);
    } else {
      const updatedTestCases = testCases.map((tc, index) =>
        index === editingTestCaseIndex ? testCase : tc
      );
      setTestCases(updatedTestCases);
      setEditingTestCaseIndex(null);
    }
  };

  const handleEditTestCase = (index: number) => {
    setEditingTestCaseIndex(index);
  };

  const handleEditPrompt = (index: number) => {
    setEditingPromptIndex(index);
  };

  const handleSavePrompt = (index: number, newPrompt: string) => {
    setPrompts((prevPrompts) =>
      prevPrompts.map((p, i) => (i === index ? newPrompt : p))
    );
    setEditingPromptIndex(null);
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

  return (
    <Container>
      <Typography variant="h4" gutterBottom>Create Evaluate Test Suite</Typography>
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
      <Typography variant="h5">Prompts</Typography>
      {prompts.map((prompt, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          {editingPromptIndex === index ? (
            <>
              <TextField
                label={`Prompt ${index + 1}`}
                value={prompt}
                onChange={(e) =>handleSavePrompt(index, e.target.value)}
                fullWidth
                margin="normal"
                multiline
              />
              <IconButton onClick={() => handleSavePrompt(index, prompt)} size="small">
                <Save />
              </IconButton>
            </>
          ) : (
            <>
              <Typography variant="body1">{`Prompt ${index + 1}: ${prompt.slice(0, 250)}`}</Typography>
              <IconButton onClick={() => handleEditPrompt(index)} size="small">
                <Edit />
              </IconButton>
            </>
          )}
          <IconButton onClick={() => handleRemovePrompt(index)} size="small">
            <Delete />
          </IconButton>
        </div>
      ))}
      <Button
        variant="contained"
        color="primary"
        onClick={() => setPrompts((prevPrompts) => [...prevPrompts, ''])}
      >
        Add Prompt
      </Button>

      <Typography variant="h5">Test Cases</Typography>
      {testCases.map((testCase, index) => (
        <Box key={index} display="flex" alignItems="center" marginBottom={1}>
          <Typography variant="subtitle1">{`Test Case ${index + 1}: ${testCase.description}`}</Typography>
          <IconButton onClick={() => handleEditTestCase(index)} size="small">
            <Edit />
          </IconButton>
        </Box>
      ))}
      <TestCaseForm
        onAdd={handleAddTestCase}
        varsList={varsList}
        initialValues={editingTestCaseIndex !== null ? testCases[editingTestCaseIndex] : undefined}
        onCancel={() => setEditingTestCaseIndex(null)}
      />
      <Box mt={4}>
        <Button variant="contained" color="primary" onClick={handleSubmit} style={{ marginTop: 16 }}>
          Submit
        </Button>
      </Box>
    </Container>
  );
};

export default EvaluateTestSuiteCreator;
