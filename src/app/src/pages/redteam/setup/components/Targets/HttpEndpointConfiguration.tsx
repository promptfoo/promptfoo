import './syntax-highlighting.css';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';

import { useCallback, useEffect, useState } from 'react';

import { callApi } from '@app/utils/api';
import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import HttpIcon from '@mui/icons-material/Http';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import { useTheme } from '@mui/material/styles';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import dedent from 'dedent';
import yaml from 'js-yaml';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import HttpAdvancedConfiguration from './HttpAdvancedConfiguration';
import PostmanImportDialog from './PostmanImportDialog';
import TestSection from './TestSection';

import type { ProviderOptions } from '../../types';
import type { TestResult } from './TestSection';

interface HttpEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  bodyError: string | React.ReactNode | null;
  setBodyError: (error: string | React.ReactNode | null) => void;
  urlError: string | null;
  setUrlError: (error: string | null) => void;
  onTargetTested?: (success: boolean) => void;
  onSessionTested?: (success: boolean) => void;
}

interface GeneratedConfig {
  id: string;
  config: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    request?: string;
    transformRequest?: string;
    transformResponse?: string;
    sessionParser?: string;
  };
}

const highlightJS = (code: string): string => {
  try {
    const grammar = Prism?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

const highlightJSON = (code: string): string => {
  try {
    const grammar = Prism?.languages?.json;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'json');
  } catch {
    return code;
  }
};

const HttpEndpointConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  bodyError,
  setBodyError,
  urlError,
  setUrlError,
  onTargetTested,
  onSessionTested,
}: HttpEndpointConfigurationProps): JSX.Element => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  const [requestBody, setRequestBody] = useState(
    typeof selectedTarget.config.body === 'string'
      ? selectedTarget.config.body
      : JSON.stringify(selectedTarget.config.body, null, 2) || '',
  );
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>(
    Object.entries(selectedTarget.config.headers || {}).map(([key, value]) => ({
      key,
      value: String(value),
    })),
  );

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [request, setRequest] = useState(
    `POST /v1/chat HTTP/1.1
Host: api.example.com
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "{{prompt}}"
    }
  ]
}`,
  );
  const [response, setResponse] = useState(
    `{
  "response": "Hello! How can I help you today?",
  "metadata": {
    "model": "gpt-3.5-turbo",
    "tokens": 12
  }
}`,
  );
  const [generatedConfig, setGeneratedConfig] = useState<GeneratedConfig | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // Import menu state
  const [importMenuAnchor, setImportMenuAnchor] = useState<null | HTMLElement>(null);
  const [postmanDialogOpen, setPostmanDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Test Target state
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Response transform test state
  const [responseTestOpen, setResponseTestOpen] = useState(false);
  const [responseTestLoading, setResponseTestLoading] = useState(false);
  const [responseTestInput, setResponseTestInput] = useState(
    JSON.stringify(
      {
        choices: [
          {
            message: {
              content: 'The capital of France is Paris.',
            },
          },
        ],
        usage: {
          total_tokens: 42,
        },
      },
      null,
      2,
    ),
  );
  const [responseTestResult, setResponseTestResult] = useState<{
    success: boolean;
    result?: any;
    error?: string;
  } | null>(null);
  const [editableResponseTransform, setEditableResponseTransform] = useState('');

  // Handle test target
  const handleTestTarget = useCallback(async () => {
    setIsTestRunning(true);
    setTestResult(null);

    try {
      const response = await callApi('/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedTarget),
      });

      if (response.ok) {
        const data = await response.json();

        // Check for changes_needed field (configuration issues) or success field
        const hasConfigIssues = data.testResult?.changes_needed === true;
        const isSuccess = hasConfigIssues ? false : (data.testResult?.success ?? true);

        // Build the message based on the response
        let message = data.testResult?.message ?? 'Target configuration is valid!';
        if (hasConfigIssues) {
          message = data.testResult?.changes_needed_reason || 'Configuration changes are needed';
        }

        setTestResult({
          success: isSuccess,
          message: message,
          providerResponse: data.providerResponse || {},
          transformedRequest: data.transformedRequest,
          // Include the suggestions if available
          changes_needed: hasConfigIssues,
          changes_needed_suggestions: data.testResult?.changes_needed_suggestions,
        });

        if (onTargetTested) {
          onTargetTested(isSuccess);
        }
      } else {
        const errorData = await response.json();
        setTestResult({
          success: false,
          message: errorData.error || 'Failed to test target configuration',
          providerResponse: errorData.providerResponse || {},
          transformedRequest: errorData.transformedRequest,
        });

        if (onTargetTested) {
          onTargetTested(false);
        }
      }
    } catch (error) {
      console.error('Error testing target:', error);
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to test target configuration',
      });

      if (onTargetTested) {
        onTargetTested(false);
      }
    } finally {
      setIsTestRunning(false);
    }
  }, [selectedTarget, onTargetTested]);

  // Initialize editable response transform when opening modal
  useEffect(() => {
    if (responseTestOpen) {
      setEditableResponseTransform(selectedTarget.config.transformResponse || '');
    }
  }, [responseTestOpen, selectedTarget.config.transformResponse]);

  // Test response transform function
  const testResponseTransform = async () => {
    const transformCode = editableResponseTransform;
    if (!transformCode) {
      setResponseTestResult({
        success: false,
        error: 'No transform function provided',
      });
      return;
    }

    if (!responseTestInput || !responseTestInput.trim()) {
      setResponseTestResult({
        success: false,
        error: 'Please provide a test response',
      });
      return;
    }

    setResponseTestLoading(true);
    try {
      const response = await callApi('/providers/test-response-transform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transformCode,
          response: responseTestInput,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to test transform';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        setResponseTestResult({
          success: false,
          error: errorMessage,
        });
        return;
      }

      const data = await response.json();

      if (data.success) {
        // Handle the result which may be a ProviderResponse object
        const result = data.result;
        if (typeof result === 'object' && result !== null && 'output' in result) {
          setResponseTestResult({
            success: true,
            result: result.output,
          });
        } else {
          setResponseTestResult({
            success: true,
            result,
          });
        }
      } else {
        setResponseTestResult({
          success: false,
          error: data.error || 'Transform failed',
        });
      }
    } catch (error) {
      console.error('Error testing response transform:', error);
      setResponseTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test transform',
      });
    } finally {
      setResponseTestLoading(false);
    }
  };

  // Auto-size the raw request textarea between 10rem and 40rem based on line count
  const computeRawTextareaHeight = useCallback((text: string) => {
    const lineCount = (text?.match(/\n/g)?.length || 0) + 1;
    const lineHeightPx = 20; // approx for 14px monospace
    const minPx = 10 * 16; // ~10rem
    const maxPx = 40 * 16; // ~40rem
    const desired = lineCount * lineHeightPx + 20; // padding allowance
    return `${Math.min(maxPx, Math.max(minPx, desired))}px`;
  }, []);

  const resetState = useCallback(
    (isRawMode: boolean) => {
      setBodyError(null);
      setUrlError(null);

      if (isRawMode) {
        // Reset to empty raw request
        updateCustomTarget('request', '');

        // Clear structured mode fields
        updateCustomTarget('url', undefined);
        updateCustomTarget('method', undefined);
        updateCustomTarget('headers', undefined);
        updateCustomTarget('body', undefined);
      } else {
        // Reset to empty structured fields
        setHeaders([]);
        setRequestBody('');

        // Clear raw request
        updateCustomTarget('request', undefined);

        // Reset structured fields
        updateCustomTarget('url', '');
        updateCustomTarget('method', 'POST');
        updateCustomTarget('headers', {});
        updateCustomTarget('body', '');
        updateCustomTarget('useHttps', false);
      }
    },
    [updateCustomTarget, setBodyError, setUrlError],
  );

  // Header management
  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  const removeHeader = useCallback(
    (index: number) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders.splice(index, 1);

        // Update target configuration inside setState callback
        const headerObj = newHeaders.reduce(
          (acc, { key, value }) => {
            if (key) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        updateCustomTarget('headers', headerObj);

        return newHeaders;
      });
    },
    [updateCustomTarget],
  );

  const updateHeaderKey = useCallback(
    (index: number, newKey: string) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders[index] = { ...newHeaders[index], key: newKey };

        // Update target configuration inside setState callback
        const headerObj = newHeaders.reduce(
          (acc, { key, value }) => {
            if (key) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        updateCustomTarget('headers', headerObj);

        return newHeaders;
      });
    },
    [updateCustomTarget],
  );

  const updateHeaderValue = useCallback(
    (index: number, newValue: string) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders[index] = { ...newHeaders[index], value: newValue };

        // Update target configuration inside setState callback
        const headerObj = newHeaders.reduce(
          (acc, { key, value }) => {
            if (key) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>,
        );
        updateCustomTarget('headers', headerObj);

        return newHeaders;
      });
    },
    [updateCustomTarget],
  );

  const handleRequestBodyChange = (content: string) => {
    setRequestBody(content);

    // Validate JSON if content is not empty
    if (content.trim()) {
      try {
        JSON.parse(content);
        setBodyError(null); // Clear error if JSON is valid
      } catch {
        setBodyError('Invalid JSON format');
      }
    } else {
      setBodyError(null); // Clear error for empty content
    }

    updateCustomTarget('body', content);
  };

  const handleFormatJson = () => {
    if (requestBody.trim()) {
      try {
        const parsed = JSON.parse(requestBody);
        const formatted = JSON.stringify(parsed, null, 2);
        setRequestBody(formatted);
        updateCustomTarget('body', formatted);
        setBodyError(null);
      } catch {
        setBodyError('Cannot format: Invalid JSON');
      }
    }
  };

  const handleRawRequestChange = (value: string) => {
    updateCustomTarget('request', value);
  };

  // Note to Michael: don't dedent this, we want to preserve JSON formatting.
  const exampleRequest = `POST /v1/chat/completions HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer {{api_key}}

{
  "messages": [
    {
      "role": "user",
      "content": "{{prompt}}"
    }
  ]
}`;
  const placeholderText = `Enter your HTTP request here. Example:

${exampleRequest}`;

  const handleGenerateConfig = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await callApi('/providers/http-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestExample: request,
          responseExample: response,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setGeneratedConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (generatedConfig) {
      navigator.clipboard.writeText(yaml.dump(generatedConfig.config));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleApply = () => {
    if (generatedConfig) {
      if (generatedConfig.config.request) {
        resetState(true);
        updateCustomTarget('request', generatedConfig.config.request);
      } else {
        resetState(false);
        if (generatedConfig.config.url) {
          updateCustomTarget('url', generatedConfig.config.url);
        }
        if (generatedConfig.config.method) {
          updateCustomTarget('method', generatedConfig.config.method);
        }
        if (generatedConfig.config.headers) {
          updateCustomTarget('headers', generatedConfig.config.headers);
          setHeaders(
            Object.entries(generatedConfig.config.headers).map(([key, value]) => ({
              key,
              value: String(value),
            })),
          );
        }
        if (generatedConfig.config.body) {
          // First update the internal state
          const formattedBody =
            typeof generatedConfig.config.body === 'string'
              ? generatedConfig.config.body
              : JSON.stringify(generatedConfig.config.body, null, 2);
          setRequestBody(formattedBody);

          // Then update the target config with the original value
          updateCustomTarget('body', generatedConfig.config.body);
        }
      }
      updateCustomTarget('transformRequest', generatedConfig.config.transformRequest);
      updateCustomTarget('transformResponse', generatedConfig.config.transformResponse);
      updateCustomTarget('sessionParser', generatedConfig.config.sessionParser);
      setConfigDialogOpen(false);
    }
  };

  const handlePostmanImport = (config: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  }) => {
    // Apply the configuration
    resetState(false);
    updateCustomTarget('url', config.url);
    updateCustomTarget('method', config.method);
    updateCustomTarget('headers', config.headers);
    setHeaders(
      Object.entries(config.headers).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    );

    if (config.body) {
      setRequestBody(config.body);
      updateCustomTarget('body', config.body);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={Boolean(selectedTarget.config.request)}
              onChange={(e) => {
                resetState(e.target.checked);
                if (e.target.checked) {
                  updateCustomTarget('request', exampleRequest);
                }
              }}
            />
          }
          label="Use Raw HTTP Request"
        />
        <Button
          variant="outlined"
          endIcon={<ArrowDropDownIcon />}
          onClick={(e) => setImportMenuAnchor(e.currentTarget)}
        >
          Import
        </Button>
        <Menu
          anchorEl={importMenuAnchor}
          open={Boolean(importMenuAnchor)}
          onClose={() => setImportMenuAnchor(null)}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          slotProps={{
            paper: {
              sx: {
                mt: 0.5,
                minWidth: 200,
              },
            },
          }}
        >
          <MenuItem
            onClick={() => {
              setImportMenuAnchor(null);
              setConfigDialogOpen(true);
            }}
          >
            <ListItemIcon>
              <AutoFixHighIcon fontSize="small" />
            </ListItemIcon>
            Auto-fill from Example
          </MenuItem>
          <MenuItem
            onClick={() => {
              setImportMenuAnchor(null);
              setPostmanDialogOpen(true);
            }}
          >
            <ListItemIcon>
              <HttpIcon fontSize="small" />
            </ListItemIcon>
            Postman
          </MenuItem>
        </Menu>
      </Box>

      {/* Main configuration box containing everything */}
      <Box
        mt={2}
        p={2}
        sx={{
          border: 1,
          borderColor: theme.palette.divider,
          borderRadius: 1,
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
          '& .token': {
            background: 'transparent !important',
          },
        }}
      >
        {selectedTarget.config.request ? (
          <>
            <FormControlLabel
              control={
                <Switch
                  checked={selectedTarget.config.useHttps}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    updateCustomTarget('useHttps', enabled);
                  }}
                />
              }
              label="Use HTTPS"
              sx={{ mb: 2, display: 'block' }}
            />
            <textarea
              value={selectedTarget.config.request || ''}
              onChange={(e) => handleRawRequestChange(e.target.value)}
              placeholder={placeholderText}
              style={{
                width: '100%',
                height: computeRawTextareaHeight(selectedTarget.config.request || ''),
                minHeight: '10rem',
                maxHeight: '40rem',
                maxWidth: '100%',
                padding: '10px',
                border: '1px solid',
                borderColor: theme.palette.divider,
                outline: 'none',
                resize: 'vertical',
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 14,
                backgroundColor: 'transparent',
                color: theme.palette.text.primary,
                whiteSpace: 'pre',
                overflowX: 'auto',
                overflowY: 'auto',
              }}
            />
            {bodyError && (
              <Typography color="error" variant="body2" sx={{ mt: 1 }}>
                {bodyError}
              </Typography>
            )}
          </>
        ) : (
          <>
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
                onChange={(e) => updateCustomTarget('method', e.target.value)}
                label="Method"
              >
                {['GET', 'POST'].map((method) => (
                  <MenuItem key={method} value={method}>
                    {method}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
              Headers
            </Typography>
            {headers.map(({ key, value }, index) => (
              <Box key={index} display="flex" alignItems="center" mb={1}>
                <TextField
                  label="Name"
                  value={key}
                  onChange={(e) => updateHeaderKey(index, e.target.value)}
                  sx={{ mr: 1, flex: 1 }}
                />
                <TextField
                  label="Value"
                  value={value}
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

            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
              Request Body
            </Typography>
            <Box
              sx={{
                border: 1,
                borderColor: bodyError ? 'error.main' : theme.palette.divider,
                borderRadius: 1,
                mt: 1,
                position: 'relative',
                backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
              }}
            >
              <IconButton
                size="small"
                onClick={handleFormatJson}
                disabled={!requestBody.trim() || !!bodyError}
                title={bodyError ? 'Fix JSON errors first' : 'Format JSON'}
                sx={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  zIndex: 1,
                  backgroundColor:
                    theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.05)'
                      : 'rgba(0, 0, 0, 0.03)',
                  '&:hover': {
                    backgroundColor:
                      theme.palette.mode === 'dark'
                        ? 'rgba(255, 255, 255, 0.1)'
                        : 'rgba(0, 0, 0, 0.06)',
                  },
                }}
              >
                <FormatAlignLeftIcon fontSize="small" />
              </IconButton>
              <Editor
                value={
                  typeof requestBody === 'object'
                    ? JSON.stringify(requestBody, null, 2)
                    : requestBody || ''
                }
                onValueChange={handleRequestBodyChange}
                highlight={(code) => code}
                padding={10}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 14,
                  minHeight: '100px',
                  paddingRight: '40px', // Add space for the format button
                }}
              />
            </Box>
            {bodyError && (
              <Typography color="error" variant="caption" sx={{ mt: 0.5 }}>
                {bodyError}
              </Typography>
            )}
          </>
        )}

        {/* Response Transform Section - Common for both modes */}
        <Typography variant="subtitle1" gutterBottom sx={{ mt: 3 }}>
          Response Parser
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          This tells promptfoo how to extract the AI's response from your API. Most APIs return JSON
          with the actual response nested inside - this parser helps find the right part. Leave
          empty if your API returns plain text. See{' '}
          <a
            href="https://www.promptfoo.dev/docs/providers/http/#response-transform"
            target="_blank"
            rel="noopener noreferrer"
          >
            docs
          </a>{' '}
          for examples.
        </Typography>
        <Box
          sx={{
            border: 1,
            borderColor: theme.palette.divider,
            borderRadius: 1,
            position: 'relative',
            backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
          }}
        >
          <Editor
            value={selectedTarget.config.transformResponse || ''}
            onValueChange={(code) => updateCustomTarget('transformResponse', code)}
            highlight={highlightJS}
            padding={10}
            placeholder={dedent`Optional: Transform the API response before using it. Format as either:

                        1. A JavaScript object path: \`json.choices[0].message.content\`
                        2. A function that receives response data: \`(json, text) => json.choices[0].message.content || text\`

                        With guardrails: { output: json.choices[0].message.content, guardrails: { flagged: context.response.status === 500 } }`}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              minHeight: '150px',
            }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<PlayArrowIcon />}
            onClick={() => {
              setResponseTestResult(null);
              setResponseTestOpen(true);
            }}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 1,
            }}
          >
            Test
          </Button>
        </Box>

        {/* Test Target Section - Common for both modes */}
        <TestSection
          selectedTarget={selectedTarget}
          isTestRunning={isTestRunning}
          testResult={testResult}
          handleTestTarget={handleTestTarget}
          disabled={
            selectedTarget.config.request
              ? !selectedTarget.config.request
              : !selectedTarget.config.url
          }
        />
      </Box>

      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>AI Auto-fill HTTP Configuration</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Paste an example HTTP request and optionally a response. AI will automatically generate
            the configuration for you.
          </Typography>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" gutterBottom>
                Example Request (paste your HTTP request here)
              </Typography>
              <Paper elevation={3} sx={{ height: '300px', overflow: 'auto' }}>
                <Editor
                  value={request}
                  onValueChange={(val) => setRequest(val)}
                  highlight={(code) => code}
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    backgroundColor: darkMode ? '#1e1e1e' : '#f5f5f5',
                    minHeight: '100%',
                  }}
                />
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="h6" gutterBottom>
                Example Response (optional, improves accuracy)
              </Typography>
              <Paper elevation={3} sx={{ height: '300px', overflow: 'auto' }}>
                <Editor
                  value={response}
                  onValueChange={(val) => setResponse(val)}
                  highlight={(code) => code}
                  padding={10}
                  style={{
                    fontFamily: '"Fira code", "Fira Mono", monospace',
                    fontSize: 14,
                    backgroundColor: darkMode ? '#1e1e1e' : '#f5f5f5',
                    minHeight: '100%',
                  }}
                />
              </Paper>
            </Grid>
            {error && (
              <Grid size={12}>
                <Typography color="error">Error: {error}</Typography>
              </Grid>
            )}
            {generatedConfig && (
              <Grid size={12}>
                <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, mb: 1 }}>
                  <Typography variant="h6" sx={{ flexGrow: 1 }}>
                    Generated Configuration
                  </Typography>
                  <IconButton
                    onClick={handleCopy}
                    size="small"
                    title={copied ? 'Copied!' : 'Copy to clipboard'}
                    color={copied ? 'success' : 'default'}
                  >
                    {copied ? <CheckIcon /> : <ContentCopyIcon />}
                  </IconButton>
                </Box>
                <Paper elevation={3} sx={{ height: '20rem', overflow: 'auto' }}>
                  <Editor
                    value={yaml.dump(generatedConfig.config)}
                    onValueChange={() => {}} // Read-only
                    highlight={(code) => code}
                    padding={10}
                    style={{
                      fontFamily: '"Fira code", "Fira Mono", monospace',
                      fontSize: 14,
                      backgroundColor: darkMode ? '#1e1e1e' : '#f5f5f5',
                      minHeight: '100%',
                    }}
                    readOnly
                  />
                </Paper>
              </Grid>
            )}
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleGenerateConfig} disabled={generating} variant="outlined">
            {generating ? 'Generating...' : 'Generate'}
          </Button>
          {generatedConfig && (
            <Button onClick={handleApply} variant="contained" color="primary">
              Apply Configuration
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Postman Import Dialog */}
      <PostmanImportDialog
        open={postmanDialogOpen}
        onClose={() => setPostmanDialogOpen(false)}
        onImport={handlePostmanImport}
      />

      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={updateCustomTarget}
        defaultRequestTransform={selectedTarget.config.transformRequest}
        onSessionTested={onSessionTested}
      />

      {/* Response Transform Test Dialog */}
      <Dialog
        open={responseTestOpen}
        onClose={() => setResponseTestOpen(false)}
        maxWidth="xl"
        fullWidth
        PaperProps={{
          sx: {
            height: '85vh',
          },
        }}
      >
        <DialogTitle>Test Response Parser</DialogTitle>
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', height: 'calc(85vh - 64px)', p: 2 }}
        >
          <Box
            sx={{ display: 'flex', gap: 2, flex: 1, flexDirection: { xs: 'column', md: 'row' } }}
          >
            {/* Left side - Input */}
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: '0 0 58%' }}>
              <Stack spacing={2} sx={{ flex: 1 }}>
                {/* Transform Code Editor */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Parser Function
                  </Typography>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>Function signature:</strong>
                    </Typography>
                    <Typography
                      variant="body2"
                      component="pre"
                      sx={{
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        mb: 1,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {'(json, text, context) => ProviderResponse | string'}
                    </Typography>
                    <Typography variant="body2">
                      • <strong>json</strong>: any - Parsed JSON response (or null if not JSON)
                      <br />• <strong>text</strong>: string - Raw response text
                      <br />• <strong>context</strong>: {'{ response: FetchResult }'} - HTTP
                      response metadata (optional)
                      <br />
                      <br />
                      <strong>Returns:</strong> String output or {'{ output, tokenUsage?, error? }'}
                    </Typography>
                  </Alert>
                  <Box
                    sx={{
                      border: 1,
                      borderColor: 'grey.300',
                      borderRadius: 1,
                      backgroundColor: darkMode ? '#1e1e1e' : '#fff',
                    }}
                  >
                    <Editor
                      value={editableResponseTransform}
                      onValueChange={setEditableResponseTransform}
                      highlight={highlightJS}
                      padding={10}
                      placeholder="Enter parser function..."
                      style={{
                        fontFamily: '"Fira code", "Fira Mono", monospace',
                        fontSize: 14,
                        minHeight: '150px',
                      }}
                    />
                  </Box>
                </Box>

                {/* Test Input */}
                <Box>
                  <Typography variant="subtitle2" gutterBottom>
                    Test Response (JSON)
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={8}
                    value={responseTestInput}
                    onChange={(e) => setResponseTestInput(e.target.value)}
                    placeholder="Enter a test API response..."
                    variant="outlined"
                    sx={{
                      fontFamily: 'monospace',
                      '& textarea': {
                        fontFamily: '"Fira code", "Fira Mono", monospace',
                        fontSize: '0.875rem',
                      },
                    }}
                  />
                </Box>

                {/* Test Button */}
                <Button
                  variant="contained"
                  onClick={testResponseTransform}
                  disabled={responseTestLoading}
                  startIcon={<PlayArrowIcon />}
                  fullWidth
                >
                  Run Test
                </Button>

                {/* Loading */}
                {responseTestLoading && <LinearProgress />}
              </Stack>
            </Box>

            {/* Right side - Result */}
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Result
                </Typography>
                {responseTestResult ? (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      flex: 1,
                      overflow: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {responseTestResult.success ? (
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <Alert severity="success" sx={{ mb: 2 }}>
                          Parser executed successfully!
                        </Alert>
                        <Typography variant="caption" color="text.secondary" gutterBottom>
                          Parsed Output:
                        </Typography>
                        <Box
                          sx={{
                            mt: 1,
                            p: 2,
                            backgroundColor: darkMode ? '#1e1e1e' : '#f5f5f5',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                            overflow: 'auto',
                            flex: 1,
                          }}
                        >
                          <Editor
                            value={
                              typeof responseTestResult.result === 'string'
                                ? responseTestResult.result
                                : JSON.stringify(responseTestResult.result, null, 2)
                            }
                            onValueChange={() => {}}
                            highlight={highlightJSON}
                            padding={0}
                            readOnly
                            style={{
                              fontFamily: '"Fira code", "Fira Mono", monospace',
                              fontSize: 14,
                            }}
                          />
                        </Box>
                      </Box>
                    ) : (
                      <Alert severity="error">{responseTestResult.error}</Alert>
                    )}
                  </Paper>
                ) : (
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 2,
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography color="text.secondary" align="center">
                      Run the test to see results here
                    </Typography>
                  </Paper>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default HttpEndpointConfiguration;
