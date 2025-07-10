import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ManagedPromptWithVersions } from '@promptfoo/types/prompt-management';

export default function PromptTestPage() {
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  const [prompt, setPrompt] = useState<ManagedPromptWithVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [provider, setProvider] = useState('openai:gpt-3.5-turbo');
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (promptId) {
      loadPrompt();
    }
  }, [promptId]);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      const response = await callApi(`/prompts/${promptId}`);
      const data = await response.json();
      setPrompt(data);
      setSelectedVersion(data.currentVersion);
    } catch (error) {
      showToast('Failed to load prompt', 'error');
      console.error('Error loading prompt:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunTest = async () => {
    if (!prompt || !selectedVersion || !testInput.trim()) {
      showToast('Please fill in all required fields', 'warning');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      
      const versionData = prompt.versions.find(v => v.version === selectedVersion);
      if (!versionData) return;

      // Replace variables in prompt with test input
      const processedPrompt = versionData.content.replace(/\{\{.*?\}\}/g, testInput);

      // This is a simplified test - in a real implementation, you would call
      // the evaluation API with proper test cases
      const response = await callApi('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: provider,
          prompts: [processedPrompt],
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to run test');
      }

      const result = await response.json();
      setTestResult(result.providerResponse?.output || 'No output received');
    } catch (error) {
      showToast('Failed to run test', 'error');
      console.error('Error running test:', error);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Box sx={{ p: 3 }}>Loading...</Box>;
  }

  if (!prompt) {
    return <Box sx={{ p: 3 }}>Prompt not found</Box>;
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <IconButton onClick={() => navigate(`/prompts/${promptId}/edit`)}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4">{prompt.name} - Test Prompt</Typography>
        </Stack>
      </Stack>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Stack spacing={3}>
          <FormControl fullWidth>
            <InputLabel>Version</InputLabel>
            <Select
              value={selectedVersion || ''}
              onChange={(e) => setSelectedVersion(Number(e.target.value))}
              label="Version"
            >
              {prompt.versions.map((version) => (
                <MenuItem key={version.version} value={version.version}>
                  Version {version.version}
                  {version.version === prompt.currentVersion && ' (current)'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Provider</InputLabel>
            <Select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              label="Provider"
            >
              <MenuItem value="openai:gpt-3.5-turbo">OpenAI GPT-3.5 Turbo</MenuItem>
              <MenuItem value="openai:gpt-4">OpenAI GPT-4</MenuItem>
              <MenuItem value="anthropic:claude-2">Anthropic Claude 2</MenuItem>
              <MenuItem value="anthropic:claude-3">Anthropic Claude 3</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Test Input"
            placeholder="Enter test input for variables in your prompt..."
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            fullWidth
            multiline
            rows={3}
            helperText="This will replace all {{variables}} in your prompt"
          />

          <Button
            variant="contained"
            startIcon={testing ? <CircularProgress size={20} /> : <PlayArrowIcon />}
            onClick={handleRunTest}
            disabled={testing}
            fullWidth
          >
            {testing ? 'Running Test...' : 'Run Test'}
          </Button>
        </Stack>
      </Paper>

      {testResult && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Test Result</Typography>
          <Box
            sx={{
              p: 2,
              bgcolor: 'grey.100',
              borderRadius: 1,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}
          >
            {testResult}
          </Box>
        </Paper>
      )}
    </Box>
  );
} 