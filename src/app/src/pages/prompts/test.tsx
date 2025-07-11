import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { callApi } from '@app/utils/api';
import { useToast } from '@app/hooks/useToast';
import { toSimpleProviderList } from '@app/providers/defaultProviders';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import VisibilityIcon from '@mui/icons-material/Visibility';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import type { ManagedPromptWithVersions } from '@promptfoo/types/prompt-management';

// Helper function to extract variables from prompt template
const extractVariables = (template: string): string[] => {
  const regex = /\{\{([^}]+)\}\}/g;
  const variables = new Set<string>();
  let match;
  while ((match = regex.exec(template)) !== null) {
    const varName = match[1].trim();
    // Filter out special variables
    if (!varName.startsWith('_')) {
      variables.add(varName);
    }
  }
  return Array.from(variables);
};

// Helper function to render prompt with variables
const renderPrompt = (template: string, vars: Record<string, string>): string => {
  let rendered = template;
  Object.entries(vars).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    rendered = rendered.replace(regex, value);
  });
  return rendered;
};

export default function PromptTestPage() {
  const { promptId } = useParams<{ promptId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  
  // Get the centralized provider list
  const providerOptions = toSimpleProviderList();
  
  const [prompt, setPrompt] = useState<ManagedPromptWithVersions | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [provider, setProvider] = useState(providerOptions[0]?.value || 'openai:gpt-3.5-turbo');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  // Extract variables from the selected version's content
  const currentVersion = useMemo(() => {
    if (!prompt || !selectedVersion) {return null;}
    return prompt.versions.find(v => v.version === selectedVersion);
  }, [prompt, selectedVersion]);
  
  const templateVariables = useMemo(() => {
    if (!currentVersion) {return [];}
    return extractVariables(currentVersion.content);
  }, [currentVersion]);
  
  const renderedPrompt = useMemo(() => {
    if (!currentVersion) {return '';}
    return renderPrompt(currentVersion.content, variableValues);
  }, [currentVersion, variableValues]);

  const loadPrompt = async () => {
    try {
      setLoading(true);
      const response = await callApi(`/managed-prompts/${promptId}`);
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

  useEffect(() => {
    if (promptId) {
      loadPrompt();
    }
  }, [promptId]);
  
  // Initialize variable values when version changes
  useEffect(() => {
    if (templateVariables.length > 0) {
      const initialValues: Record<string, string> = {};
      templateVariables.forEach(varName => {
        if (!variableValues[varName]) {
          initialValues[varName] = '';
        }
      });
      if (Object.keys(initialValues).length > 0) {
        setVariableValues(prev => ({ ...prev, ...initialValues }));
      }
    }
  }, [templateVariables]);

  const handleRunTest = async () => {
    if (!prompt || !selectedVersion) {
      showToast('Please select a version', 'warning');
      return;
    }

    // Check if all variables have values
    const missingVars = templateVariables.filter(varName => !variableValues[varName]?.trim());
    if (missingVars.length > 0) {
      showToast(`Please provide values for: ${missingVars.join(', ')}`, 'warning');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);

      // Test the prompt with the provider
      const response = await callApi('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: provider,
          config: {},
          prompts: [renderedPrompt],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to run test');
      }

      const result = await response.json();
      setTestResult(result);
    } catch (error: any) {
      showToast(error.message || 'Failed to run test', 'error');
      console.error('Error running test:', error);
    } finally {
      setTesting(false);
    }
  };
  
  const handleVariableChange = (varName: string, value: string) => {
    setVariableValues(prev => ({ ...prev, [varName]: value }));
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
                  {version.notes && ` - ${version.notes}`}
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
              {providerOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {templateVariables.length === 0 ? (
            <Alert severity="info">
              This prompt has no variables. You can test it directly.
            </Alert>
          ) : (
            <>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                  <Typography variant="subtitle1">Variables</Typography>
                  <Tooltip title="Provide values for each variable in your prompt template">
                    <IconButton size="small">
                      <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
                <Stack spacing={2}>
                  {templateVariables.map((varName) => (
                    <TextField
                      key={varName}
                      label={varName}
                      placeholder={`Enter value for {{${varName}}}`}
                      value={variableValues[varName] || ''}
                      onChange={(e) => handleVariableChange(varName, e.target.value)}
                      fullWidth
                      multiline
                      minRows={1}
                      maxRows={4}
                    />
                  ))}
                </Stack>
              </Box>
            </>
          )}

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<VisibilityIcon />}
              onClick={() => setShowPreview(true)}
              disabled={!currentVersion}
              fullWidth
            >
              Preview Prompt
            </Button>
            <Button
              variant="contained"
              startIcon={testing ? <CircularProgress size={20} color="inherit" /> : <PlayArrowIcon />}
              onClick={handleRunTest}
              disabled={testing || !currentVersion}
              fullWidth
            >
              {testing ? 'Running Test...' : 'Run Test'}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {testResult && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Test Result</Typography>
          {testResult.error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {testResult.error}
            </Alert>
          ) : (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Provider Response:
                </Typography>
                <Box
                  sx={{
                    p: 2,
                    bgcolor: 'grey.100',
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    mt: 1,
                  }}
                >
                  {testResult.providerResponse?.output || 'No output received'}
                </Box>
              </Box>
              
              {testResult.providerResponse?.metadata && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    Metadata:
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    {testResult.providerResponse.metadata.model && (
                      <Typography variant="body2">
                        Model: {testResult.providerResponse.metadata.model}
                      </Typography>
                    )}
                    {testResult.providerResponse.tokenUsage && (
                      <Typography variant="body2">
                        Tokens: {testResult.providerResponse.tokenUsage.total || 'N/A'}
                        {testResult.providerResponse.tokenUsage.prompt && 
                          ` (prompt: ${testResult.providerResponse.tokenUsage.prompt}, completion: ${testResult.providerResponse.tokenUsage.completion || 'N/A'})`}
                      </Typography>
                    )}
                    {testResult.providerResponse.cost && (
                      <Typography variant="body2">
                        Cost: ${testResult.providerResponse.cost.toFixed(4)}
                      </Typography>
                    )}
                  </Box>
                </Box>
              )}
            </>
          )}
        </Paper>
      )}

      {/* Preview Dialog */}
      <Dialog 
        open={showPreview} 
        onClose={() => setShowPreview(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Prompt Preview</DialogTitle>
        <DialogContent>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            This is the final prompt that will be sent to the provider:
          </Typography>
          <Box
            sx={{
              p: 2,
              bgcolor: 'grey.100',
              borderRadius: 1,
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
            }}
          >
            {renderedPrompt || '(No prompt content)'}
          </Box>
          
          {templateVariables.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" color="text.secondary">
                Variable values:
              </Typography>
              <Box sx={{ mt: 1 }}>
                {templateVariables.map(varName => (
                  <Typography key={varName} variant="body2">
                    <strong>{varName}:</strong> {variableValues[varName] || '(empty)'}
                  </Typography>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPreview(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 