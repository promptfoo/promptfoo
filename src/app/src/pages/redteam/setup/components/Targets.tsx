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
  { value: 'browser', label: 'Web Browser Automation' },
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

  const [missingFields, setMissingFields] = useState<string[]>([]);

  useEffect(() => {
    updateConfig('target', selectedTarget);
    const missingFields: string[] = [];

    if (!selectedTarget.label) {
      missingFields.push('Target Name');
    }

    // Make sure we have a url target is a valid HTTP or WebSocket endpoint
    if (
      (selectedTarget.id.startsWith('http') || selectedTarget.id.startsWith('websocket')) &&
      (!selectedTarget.config.url || !validateUrl(selectedTarget.config.url))
    ) {
      missingFields.push('URL');
    }

    setMissingFields(missingFields);
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
    } else if (value === 'browser') {
      setSelectedTarget({
        id: 'browser',
        config: {
          steps: [
            {
              action: 'navigate',
              args: { url: 'https://example.com' },
            },
          ],
        },
      });
      updateConfig('prompts', [PROMPT_EXAMPLE]);
      updateConfig('purpose', DEFAULT_PURPOSE);
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
      } else if (field === 'label') {
        updatedTarget.label = value;
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
        <TextField
          fullWidth
          sx={{ mb: 2 }}
          label="Target Name"
          value={selectedTarget.label}
          placeholder="e.g. 'customer-service-agent'"
          onChange={(e) => updateCustomTarget('label', e.target.value)}
          margin="normal"
          required
          autoFocus
          InputLabelProps={{
            shrink: true,
          }}
        />

        <Typography variant="body2" color="text.secondary" sx={{ mb: 5 }}>
          The target name will be used to report vulnerabilities. Make sure it's meaningful and
          re-use it when generating new redteam configs for the same target. Eg:
          'customer-service-agent', 'compliance-bot'
        </Typography>

        <FormControl fullWidth>
          <InputLabel id="predefined-target-label">Target Type</InputLabel>
          <Select
            labelId="predefined-target-label"
            value={selectedTarget.id}
            onChange={handleTargetChange}
            label="Target Type"
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
                InputLabelProps={{
                  shrink: true,
                }}
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
        {selectedTarget.id.startsWith('browser') && (
          <Box mt={2}>
            <Typography variant="h6" gutterBottom>
              Browser Automation Configuration
            </Typography>
            <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Configure browser automation steps to interact with web applications. Each step
                represents an action like navigation, clicking, or typing.
              </Typography>

              <FormControl fullWidth margin="normal">
                <InputLabel>Headless Mode</InputLabel>
                <Select
                  value={selectedTarget.config.headless ?? true}
                  onChange={(e) => updateCustomTarget('headless', e.target.value === 'true')}
                  label="Headless Mode"
                >
                  <MenuItem value="true">Yes (Hidden Browser)</MenuItem>
                  <MenuItem value="false">No (Visible Browser)</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Timeout (ms)"
                type="number"
                value={selectedTarget.config.timeoutMs || 30000}
                onChange={(e) => updateCustomTarget('timeoutMs', Number(e.target.value))}
                margin="normal"
                helperText="Maximum time to wait for browser operations (in milliseconds)"
              />

              <TextField
                fullWidth
                label="Response Parser"
                value={selectedTarget.config.responseParser || ''}
                onChange={(e) => updateCustomTarget('responseParser', e.target.value)}
                margin="normal"
                placeholder="e.g., extracted.searchResults"
                helperText="JavaScript expression to parse the extracted data"
              />

              <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
                Browser Steps
              </Typography>

              {selectedTarget.config.steps?.map((step: any, index: number) => (
                <Box
                  key={index}
                  sx={{ mb: 2, p: 2, border: 1, borderColor: 'grey.300', borderRadius: 1 }}
                >
                  <Stack direction="row" spacing={2} alignItems="center">
                    <FormControl sx={{ minWidth: 200 }}>
                      <InputLabel>Action Type</InputLabel>
                      <Select
                        value={step.action || ''}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = { ...step, action: e.target.value };
                          updateCustomTarget('steps', newSteps);
                        }}
                        label="Action Type"
                      >
                        <MenuItem value="navigate">Navigate</MenuItem>
                        <MenuItem value="click">Click</MenuItem>
                        <MenuItem value="type">Type</MenuItem>
                        <MenuItem value="extract">Extract</MenuItem>
                        <MenuItem value="wait">Wait</MenuItem>
                        <MenuItem value="waitForNewChildren">Wait for New Children</MenuItem>
                      </Select>
                    </FormControl>

                    <IconButton
                      onClick={() => {
                        const newSteps = selectedTarget.config.steps?.filter(
                          (_: any, i: number) => i !== index,
                        );
                        updateCustomTarget('steps', newSteps);
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Stack>

                  <Box sx={{ mt: 2 }}>
                    {step.action === 'navigate' && (
                      <TextField
                        fullWidth
                        label="URL"
                        value={step.args?.url || ''}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, url: e.target.value },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                        margin="normal"
                        placeholder="https://example.com"
                      />
                    )}

                    {(step.action === 'click' ||
                      step.action === 'type' ||
                      step.action === 'extract') && (
                      <Stack spacing={2}>
                        <TextField
                          fullWidth
                          label="Selector"
                          value={step.args?.selector || ''}
                          onChange={(e) => {
                            const newSteps = [...(selectedTarget.config.steps || [])];
                            newSteps[index] = {
                              ...step,
                              args: { ...step.args, selector: e.target.value },
                            };
                            updateCustomTarget('steps', newSteps);
                          }}
                          margin="normal"
                          placeholder="#search-input"
                        />
                        {step.action === 'click' && (
                          <FormControl>
                            <InputLabel>Optional</InputLabel>
                            <Select
                              value={step.args?.optional || false}
                              onChange={(e) => {
                                const newSteps = [...(selectedTarget.config.steps || [])];
                                newSteps[index] = {
                                  ...step,
                                  args: { ...step.args, optional: e.target.value === 'true' },
                                };
                                updateCustomTarget('steps', newSteps);
                              }}
                              label="Optional"
                            >
                              <MenuItem value="true">Yes</MenuItem>
                              <MenuItem value="false">No</MenuItem>
                            </Select>
                          </FormControl>
                        )}
                      </Stack>
                    )}

                    {step.action === 'type' && (
                      <TextField
                        fullWidth
                        label="Text"
                        value={step.args?.text || ''}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, text: e.target.value },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                        margin="normal"
                        placeholder="{{prompt}}"
                      />
                    )}

                    {step.action === 'wait' && (
                      <TextField
                        fullWidth
                        label="Wait Time (ms)"
                        type="number"
                        value={step.args?.ms || 1000}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = {
                            ...step,
                            args: { ...step.args, ms: Number(e.target.value) },
                          };
                          updateCustomTarget('steps', newSteps);
                        }}
                        margin="normal"
                      />
                    )}

                    {step.action === 'extract' && (
                      <TextField
                        fullWidth
                        label="Variable Name"
                        value={step.name || ''}
                        onChange={(e) => {
                          const newSteps = [...(selectedTarget.config.steps || [])];
                          newSteps[index] = { ...step, name: e.target.value };
                          updateCustomTarget('steps', newSteps);
                        }}
                        margin="normal"
                        placeholder="searchResults"
                      />
                    )}

                    {step.action === 'waitForNewChildren' && (
                      <>
                        <TextField
                          fullWidth
                          label="Parent Selector"
                          value={step.args?.parentSelector || ''}
                          onChange={(e) => {
                            const newSteps = [...(selectedTarget.config.steps || [])];
                            newSteps[index] = {
                              ...step,
                              args: { ...step.args, parentSelector: e.target.value },
                            };
                            updateCustomTarget('steps', newSteps);
                          }}
                          margin="normal"
                          placeholder="#results"
                        />
                        <TextField
                          fullWidth
                          label="Initial Delay (ms)"
                          type="number"
                          value={step.args?.delay || 1000}
                          onChange={(e) => {
                            const newSteps = [...(selectedTarget.config.steps || [])];
                            newSteps[index] = {
                              ...step,
                              args: { ...step.args, delay: Number(e.target.value) },
                            };
                            updateCustomTarget('steps', newSteps);
                          }}
                          margin="normal"
                        />
                        <TextField
                          fullWidth
                          label="Timeout (ms)"
                          type="number"
                          value={step.args?.timeout || 30000}
                          onChange={(e) => {
                            const newSteps = [...(selectedTarget.config.steps || [])];
                            newSteps[index] = {
                              ...step,
                              args: { ...step.args, timeout: Number(e.target.value) },
                            };
                            updateCustomTarget('steps', newSteps);
                          }}
                          margin="normal"
                        />
                      </>
                    )}
                  </Box>
                </Box>
              ))}

              <Button
                startIcon={<AddIcon />}
                onClick={() => {
                  const newSteps = [
                    ...(selectedTarget.config.steps || []),
                    { action: '', args: {} },
                  ];
                  updateCustomTarget('steps', newSteps);
                }}
                variant="outlined"
                sx={{ mt: 1 }}
              >
                Add Step
              </Button>
            </Box>
          </Box>
        )}
      </Box>

      {testingEnabled && (
        <Box mt={4}>
          <Stack direction="row" alignItems="center" spacing={2} mb={2}>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
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
          </Stack>

          {!selectedTarget.config.url && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
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
                    sx={{
                      p: 2,
                      bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                      maxHeight: '200px',
                      overflow: 'auto',
                    }}
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
                  <Paper
                    elevation={1}
                    sx={{
                      p: 2,
                      bgcolor: (theme) => (theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100'),
                    }}
                  >
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

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 4,
          width: '100%',
          position: 'relative',
        }}
      >
        {missingFields.length > 0 && (
          <Alert
            severity="error"
            sx={{
              flexGrow: 1,
              mr: 2,
              '& .MuiAlert-message': {
                display: 'flex',
                alignItems: 'center',
              },
            }}
          >
            <Typography variant="body2">
              Missing required fields: {missingFields.join(', ')}
            </Typography>
          </Alert>
        )}

        <Button
          variant="contained"
          onClick={onNext}
          endIcon={<KeyboardArrowRightIcon />}
          disabled={missingFields.length > 0}
          sx={{
            backgroundColor: theme.palette.primary.main,
            '&:hover': { backgroundColor: theme.palette.primary.dark },
            '&:disabled': { backgroundColor: theme.palette.action.disabledBackground },
            px: 4,
            py: 1,
            minWidth: '150px',
          }}
        >
          Next
        </Button>
      </Box>
    </Stack>
  );
}
