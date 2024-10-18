import React, { useState, useEffect } from 'react';
import { callApi } from '@app/utils/api';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import InfoIcon from '@mui/icons-material/Info';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import type { SelectChangeEvent } from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import TextareaAutosize from '@mui/material/TextareaAutosize';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import {
  DEFAULT_HTTP_TARGET,
  PROMPT_EXAMPLE,
  DEFAULT_PURPOSE,
  useRedTeamConfig,
} from '../hooks/useRedTeamConfig';
import type { ProviderOptions } from '../types';

interface TargetsProps {
  onNext: () => void;
  setupModalOpen: boolean;
}

const predefinedTargets = [
  { value: '', label: 'Select a target' },
  { value: 'http', label: 'HTTP/HTTPS Endpoint' },
  { value: 'websocket', label: 'WebSocket Endpoint' },
  { value: 'openai:gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai:gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'anthropic:claude-3-5-sonnet-20240620', label: 'Anthropic Claude 3.5 Sonnet' },
  { value: 'anthropic:claude-3-opus-20240307', label: 'Anthropic Claude 3 Opus' },
  { value: 'vertex:gemini-pro', label: 'Google Vertex AI Gemini Pro' },
];

const validateUrl = (url: string, type: 'http' | 'websocket' = 'http'): boolean => {
  try {
    const parsedUrl = new URL(url);
    if (type === 'http') {
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    } else if (type === 'websocket') {
      return ['ws:', 'wss:'].includes(parsedUrl.protocol);
    }
    return false;
  } catch {
    return false;
  }
};

export default function Targets({ onNext, setupModalOpen }: TargetsProps) {
  const { config, updateConfig } = useRedTeamConfig();
  const theme = useTheme();
  const selectedTarget = config.target || DEFAULT_HTTP_TARGET;
  const setSelectedTarget = (value: ProviderOptions) => {
    updateConfig('target', value);
  };
  const [urlError, setUrlError] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [testingTarget, setTestingTarget] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    suggestions?: string[];
    providerResponse?: {
      raw: string;
      output: string;
    };
  } | null>(null);
  const [testingEnabled, setTestingEnabled] = useState(selectedTarget.id === 'http');
  const [isJsonContentType, setIsJsonContentType] = useState(
    selectedTarget.config.headers &&
      selectedTarget.config.headers['Content-Type'] === 'application/json',
  );
  const [requestBody, setRequestBody] = useState(
    isJsonContentType ? JSON.stringify(selectedTarget.config.body) : selectedTarget.config.body,
  );

  useEffect(() => {
    updateConfig('target', selectedTarget);
  }, [selectedTarget, updateConfig]);

  const handleTargetChange = (event: SelectChangeEvent<string>) => {
    const value = event.target.value as string;

    if (value === 'javascript' || value === 'python') {
      const filePath =
        value === 'javascript'
          ? 'file://path/to/custom_provider.js'
          : 'file://path/to/custom_provider.py';
      setSelectedTarget({ id: filePath, config: {} });
      updateConfig('prompts', [PROMPT_EXAMPLE]);
      updateConfig('purpose', DEFAULT_PURPOSE);
    } else if (value === 'http') {
      setSelectedTarget(DEFAULT_HTTP_TARGET);
      updateConfig('prompts', ['{{prompt}}']);
      updateConfig('purpose', '');
    } else if (value === 'websocket') {
      setSelectedTarget({
        id: 'websocket',
        config: {
          type: 'websocket',
          url: 'wss://example.com/ws',
          messageTemplate: '{"message": "{{prompt}}"}',
          responseParser: 'response.message',
          timeoutMs: 30000,
        },
      });
      updateConfig('prompts', ['{{prompt}}']);
      updateConfig('purpose', '');
    } else {
      setSelectedTarget({ id: value, config: {} });
      updateConfig('prompts', [PROMPT_EXAMPLE]);
      updateConfig('purpose', DEFAULT_PURPOSE);
    }
  };

  useEffect(() => {
    setTestingEnabled(selectedTarget.id === 'http');

    const hasJsonContentType = Object.keys(selectedTarget.config.headers || {}).some(
      (header) =>
        header.toLowerCase() === 'content-type' &&
        selectedTarget.config.headers?.[header].toLowerCase().includes('application/json'),
    );

    setIsJsonContentType(hasJsonContentType);
  }, [selectedTarget]);

  const updateCustomTarget = (field: string, value: any) => {
    if (typeof selectedTarget === 'object') {
      const updatedTarget = { ...selectedTarget } as ProviderOptions;
      if (field === 'id') {
        updatedTarget.id = value;
        if (validateUrl(value, 'http')) {
          setUrlError(null);
        } else {
          setUrlError('Please enter a valid HTTP URL (http:// or https://)');
        }
      } else if (field === 'body') {
        updatedTarget.config.body = value;
        setBodyError(null);
        if (isJsonContentType) {
          try {
            const parsedBody = JSON.parse(value.trim());
            updatedTarget.config.body = parsedBody;
            setBodyError(null);
          } catch {
            setBodyError('Invalid JSON');
          }
        }
        if (!value.includes('{{prompt}}')) {
          setBodyError('Request body must contain {{prompt}}');
        }
      } else {
        (updatedTarget.config as any)[field] = value;
      }

      setSelectedTarget(updatedTarget);
    }
  };

  const updateWebSocketTarget = (field: string, value: any) => {
    if (typeof selectedTarget === 'object') {
      const updatedTarget = { ...selectedTarget } as ProviderOptions;
      if (field === 'id') {
        updatedTarget.id = value;
        if (validateUrl(value, 'websocket')) {
          setUrlError(null);
        } else {
          setUrlError('Please enter a valid WebSocket URL (ws:// or wss://)');
        }
      } else if (field in updatedTarget.config) {
        (updatedTarget.config as any)[field] = value;
      }
      setSelectedTarget(updatedTarget);
    }
  };

  const updateHeaderKey = (index: number, newKey: string) => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers };
      const oldKey = Object.keys(updatedHeaders)[index];
      const value = updatedHeaders[oldKey];
      delete updatedHeaders[oldKey];
      updatedHeaders[newKey] = value;
      updateCustomTarget('headers', updatedHeaders);
    }
  };

  const updateHeaderValue = (index: number, newValue: string) => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers };
      const key = Object.keys(updatedHeaders)[index];
      updatedHeaders[key] = newValue;
      updateCustomTarget('headers', updatedHeaders);
    }
  };

  const addHeader = () => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers, '': '' };
      updateCustomTarget('headers', updatedHeaders);
    }
  };

  const removeHeader = (index: number) => {
    if (typeof selectedTarget === 'object') {
      const updatedHeaders = { ...selectedTarget.config.headers };
      const key = Object.keys(updatedHeaders)[index];
      delete updatedHeaders[key];
      updateCustomTarget('headers', updatedHeaders);
    }
  };

  const handleTestTarget = async () => {
    setTestingTarget(true);
    setTestResult(null);
    try {
      const response = await callApi('/providers/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(selectedTarget),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();

      const result = data.test_result;
      if (result.error) {
        setTestResult({
          success: false,
          message: result.error,
          providerResponse: data.provider_response,
        });
      } else if (result.changes_needed) {
        setTestResult({
          success: false,
          message: result.changes_needed_reason,
          suggestions: result.changes_needed_suggestions,
          providerResponse: data.provider_response,
        });
      } else {
        setTestResult({
          success: true,
          message: 'Target configuration is valid!',
          providerResponse: data.provider_response,
        });
      }
    } catch (error) {
      console.error('Error testing target:', error);
      setTestResult({
        success: false,
        message: 'An error occurred while testing the target.',
      });
    } finally {
      setTestingTarget(false);
    }
  };

  return (
    <Stack direction="column" spacing={3}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold', mb: 3 }}>
        Select Red Team Target
      </Typography>

      <Typography variant="body1">
        A target is the specific LLM or endpoint you want to evaluate in your red teaming process.
        In Promptfoo targets are also known as providers. You can configure additional targets
        later.
      </Typography>
      <Typography variant="body1">
        For more information on available providers and how to configure them, please visit our{' '}
        <Link href="https://www.promptfoo.dev/docs/providers/" target="_blank" rel="noopener">
          provider documentation
        </Link>
        .
      </Typography>

      <Box mb={4}>
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 'medium', mb: 3 }}>
          Select a Target
        </Typography>
        <FormControl fullWidth>
          <InputLabel id="predefined-target-label">Target</InputLabel>
          <Select
            labelId="predefined-target-label"
            value={selectedTarget.id}
            onChange={handleTargetChange}
            label="Target"
          >
            {predefinedTargets.map((target) => (
              <MenuItem key={target.value} value={target.value}>
                {target.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {(selectedTarget.id.startsWith('javascript') || selectedTarget.id.startsWith('python')) && (
          <TextField
            fullWidth
            label="Custom Target"
            value={selectedTarget.id}
            onChange={(e) => updateCustomTarget('id', e.target.value)}
            margin="normal"
          />
        )}
        {selectedTarget.id.startsWith('file://') && (
          <>
            {selectedTarget.id.endsWith('.js') && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                Learn how to set up a custom JavaScript provider{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/custom-api/"
                  target="_blank"
                  rel="noopener"
                >
                  here
                </Link>
                .
              </Typography>
            )}
            {selectedTarget.id.endsWith('.py') && (
              <Typography variant="body1" sx={{ mt: 1 }}>
                Learn how to set up a custom Python provider{' '}
                <Link
                  href="https://www.promptfoo.dev/docs/providers/python/"
                  target="_blank"
                  rel="noopener"
                >
                  here
                </Link>
                .
              </Typography>
            )}
          </>
        )}
        {selectedTarget.id.startsWith('http') && (
          <Box mt={2}>
            <Typography variant="h6" gutterBottom>
              HTTP Endpoint Configuration
            </Typography>
            <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
              <TextField
                fullWidth
                label="URL"
                value={selectedTarget.config.url}
                onChange={(e) => updateCustomTarget('url', e.target.value)}
                margin="normal"
                error={!!urlError}
                helperText={urlError}
                autoFocus
                placeholder="https://example.com/api/chat"
                required
              />
              <FormControl fullWidth margin="normal">
                <InputLabel id="method-label">Method</InputLabel>
                <Select
                  labelId="method-label"
                  value={selectedTarget.config.method}
                  onChange={(e: SelectChangeEvent<string>) =>
                    updateCustomTarget('method', e.target.value)
                  }
                  label="Method"
                >
                  {['GET', 'POST'].map((method) => (
                    <MenuItem key={method} value={method}>
                      {method}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* New Headers Form */}
              <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                Headers
              </Typography>
              {selectedTarget.config.headers &&
                Object.entries(selectedTarget.config.headers).map(([key, value], index) => (
                  <Box key={index} display="flex" alignItems="center" mb={1}>
                    <TextField
                      label="Name"
                      value={key}
                      onChange={(e) => updateHeaderKey(index, e.target.value)}
                      sx={{ mr: 1, flex: 1 }}
                    />
                    <TextField
                      label="Value"
                      value={value as string}
                      onChange={(e) => updateHeaderValue(index, e.target.value)}
                      sx={{ mr: 1, flex: 1 }}
                    />
                    <IconButton onClick={() => removeHeader(index)}>
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                ))}
              <Button startIcon={<AddIcon />} onClick={addHeader} variant="outlined" sx={{ mt: 1 }}>
                Add Header
              </Button>

              <TextField
                fullWidth
                label="Request body"
                value={requestBody}
                error={!!bodyError}
                helperText={bodyError}
                onChange={(e) => {
                  setRequestBody(e.target.value);
                  updateCustomTarget('body', e.target.value);
                }}
                margin="normal"
                multiline
                minRows={1}
                maxRows={10}
                InputProps={{
                  inputComponent: TextareaAutosize,
                }}
              />
              <TextField
                fullWidth
                label="Response Parser"
                value={selectedTarget.config.responseParser}
                placeholder="Optional: A Javascript expression to parse the response. E.g. json.choices[0].message.content"
                onChange={(e) => updateCustomTarget('responseParser', e.target.value)}
                margin="normal"
              />
            </Box>
          </Box>
        )}
        {selectedTarget.id.startsWith('websocket') && (
          <Box mt={2}>
            <Typography variant="h6" gutterBottom>
              Custom WebSocket Endpoint Configuration
            </Typography>
            <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
              <TextField
                fullWidth
                label="WebSocket URL"
                value={selectedTarget.config.url}
                onChange={(e) => updateWebSocketTarget('url', e.target.value)}
                margin="normal"
                error={!!urlError}
                helperText={urlError}
              />
              <TextField
                fullWidth
                label="Message Template"
                value={selectedTarget.config.messageTemplate}
                onChange={(e) => updateWebSocketTarget('messageTemplate', e.target.value)}
                margin="normal"
                multiline
                rows={3}
              />
              <TextField
                fullWidth
                label="Response Parser"
                value={selectedTarget.config.responseParser}
                onChange={(e) => updateWebSocketTarget('responseParser', e.target.value)}
                margin="normal"
              />
              <TextField
                fullWidth
                label="Timeout (ms)"
                type="number"
                value={selectedTarget.config.timeoutMs}
                onChange={(e) =>
                  updateWebSocketTarget('timeoutMs', Number.parseInt(e.target.value))
                }
                margin="normal"
              />
            </Box>
          </Box>
        )}
      </Box>

      {testingEnabled && (
        <Box mt={4}>
          <Typography variant="h6" gutterBottom>
            Test Target Configuration
          </Typography>
          <Button
            variant="outlined"
            onClick={handleTestTarget}
            disabled={testingTarget || !selectedTarget.config.url}
            startIcon={testingTarget ? <CircularProgress size={20} /> : null}
          >
            {testingTarget ? 'Testing...' : 'Test Target'}
          </Button>
          {!selectedTarget.config.url && (
            <Typography variant="body1" sx={{ mt: 1, color: 'red' }}>
              Please enter a valid URL to test the target.
            </Typography>
          )}

          {testResult && (
            <Box mt={2}>
              <Alert severity={testResult.success ? 'success' : 'error'}>
                {testResult.message}
              </Alert>
              <Accordion sx={{ mt: 2 }}>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  aria-controls="provider-response-content"
                  id="provider-response-header"
                >
                  <Typography>Provider Response Details</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="subtitle2" gutterBottom>
                    Raw Result:
                  </Typography>
                  <Paper
                    elevation={0}
                    sx={{ p: 2, bgcolor: 'grey.100', maxHeight: '200px', overflow: 'auto' }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(testResult.providerResponse?.raw, null, 2)}
                    </pre>
                  </Paper>
                  <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                    Parsed Result:
                  </Typography>
                  <Paper
                    elevation={0}
                    sx={{ p: 2, bgcolor: 'grey.100', maxHeight: '200px', overflow: 'auto' }}
                  >
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify(testResult.providerResponse?.output, null, 2)}
                    </pre>
                  </Paper>
                </AccordionDetails>
              </Accordion>
              {testResult.suggestions && (
                <Box mt={2}>
                  <Typography variant="subtitle1" gutterBottom>
                    Suggestions:
                  </Typography>
                  <Paper elevation={1} sx={{ p: 2, bgcolor: 'grey.100' }}>
                    <List>
                      {testResult.suggestions.map((suggestion, index) => (
                        <ListItem key={index}>
                          <ListItemIcon>
                            <InfoIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText primary={suggestion} />
                        </ListItem>
                      ))}
                    </List>
                  </Paper>
                </Box>
              )}
            </Box>
          )}
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
        <Button
          variant="contained"
          onClick={onNext}
          endIcon={<KeyboardArrowRightIcon />}
          disabled={!selectedTarget}
          sx={{
            backgroundColor: theme.palette.primary.main,
            '&:hover': { backgroundColor: theme.palette.primary.dark },
            '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
            px: 4,
            py: 1,
          }}
        >
          Next
        </Button>
      </Box>
    </Stack>
  );
}
