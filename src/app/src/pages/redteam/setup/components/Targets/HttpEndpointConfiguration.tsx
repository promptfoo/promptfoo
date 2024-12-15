import React, { useEffect, useCallback, useState } from 'react';
import Editor from 'react-simple-code-editor';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
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
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import yaml from 'js-yaml';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import type { ProviderOptions } from '../../types';
import 'prismjs/themes/prism.css';

interface HttpEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  bodyError: string | null;
  setBodyError: (error: string | null) => void;
  urlError: string | null;
  setUrlError: (error: string | null) => void;
  forceStructured?: boolean;
  setForceStructured: (force: boolean) => void;
  updateFullTarget: (target: ProviderOptions) => void;
}

interface GeneratedConfig {
  id: string;
  config: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    request?: string;
    transformResponse?: string;
  };
}

const EXAMPLE_TARGET = {
  id: 'http',
  label: 'Acme Chatbot',
  config: {
    url: 'https://acme-cx-chatbot.promptfoo.dev/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      messages: [
        {
          role: 'user',
          content: '{{prompt}}',
        },
      ],
    },
    transformResponse: 'json.response',
  },
};

const HttpEndpointConfiguration: React.FC<HttpEndpointConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  bodyError,
  setBodyError,
  urlError,
  setUrlError,
  forceStructured,
  setForceStructured,
  updateFullTarget,
}): JSX.Element => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  // Internal state management
  const [useRawRequest, setUseRawRequest] = useState(
    forceStructured ? false : !!selectedTarget.config.request,
  );
  const [rawRequestValue, setRawRequestValue] = useState(selectedTarget.config.request || '');
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
  const [isJsonContentType] = useState(true); // Used for syntax highlighting
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
  const [copied, setCopied] = useState(false);

  const resetState = useCallback(
    (isRawMode: boolean) => {
      setBodyError(null);
      setUrlError(null);

      if (isRawMode) {
        // Reset to empty raw request
        setRawRequestValue('');
        updateCustomTarget('request', '');

        // Clear structured mode fields
        updateCustomTarget('url', undefined);
        updateCustomTarget('method', undefined);
        updateCustomTarget('headers', undefined);
        updateCustomTarget('body', undefined);
      } else {
        // Reset to empty structured fields
        setRawRequestValue('');
        setHeaders([]);
        setRequestBody('');

        // Clear raw request
        updateCustomTarget('request', undefined);

        // Reset structured fields
        updateCustomTarget('url', '');
        updateCustomTarget('method', 'POST');
        updateCustomTarget('headers', {});
        updateCustomTarget('body', '');
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
        return newHeaders;
      });

      // Update target configuration
      const headerObj = headers.reduce(
        (acc, { key, value }) => {
          if (key) {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );
      updateCustomTarget('headers', headerObj);
    },
    [headers, updateCustomTarget],
  );

  const updateHeaderKey = useCallback(
    (index: number, newKey: string) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders[index] = { ...newHeaders[index], key: newKey };
        return newHeaders;
      });

      // Update target configuration
      const headerObj = headers.reduce(
        (acc, { key, value }) => {
          if (key) {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );
      updateCustomTarget('headers', headerObj);
    },
    [headers, updateCustomTarget],
  );

  const updateHeaderValue = useCallback(
    (index: number, newValue: string) => {
      setHeaders((prev) => {
        const newHeaders = [...prev];
        newHeaders[index] = { ...newHeaders[index], value: newValue };
        return newHeaders;
      });

      // Update target configuration
      const headerObj = headers.reduce(
        (acc, { key, value }) => {
          if (key) {
            acc[key] = value;
          }
          return acc;
        },
        {} as Record<string, string>,
      );
      updateCustomTarget('headers', headerObj);
    },
    [headers, updateCustomTarget],
  );

  const handleRequestBodyChange = (code: string) => {
    setRequestBody(code);
    // Update state immediately without validation
    updateCustomTarget('body', code);
  };

  const handleRawRequestChange = (value: string) => {
    setRawRequestValue(value);
    // Update state immediately without validation
    updateCustomTarget('request', value);
  };

  // Separate validation from state updates
  useEffect(() => {
    if (!useRawRequest) {
      setBodyError(null);
      return;
    }

    // Don't show errors while typing short content
    if (!rawRequestValue.trim() || rawRequestValue.trim().length < 20) {
      setBodyError(null);
      return;
    }

    // Debounce validation to avoid blocking input
    const timeoutId = setTimeout(() => {
      const request = rawRequestValue.trim();

      // Check for required template variable
      if (!request.includes('{{prompt}}')) {
        setBodyError('Request must include {{prompt}} template variable');
        return;
      }

      // Check for basic HTTP request format
      const firstLine = request.split('\n')[0];
      const hasValidFirstLine = /^(POST|GET|PUT|DELETE)\s+\S+/.test(firstLine);
      if (!hasValidFirstLine) {
        setBodyError('First line must be in format: METHOD URL');
        return;
      }

      setBodyError(null);
    }, 750);

    return () => clearTimeout(timeoutId);
  }, [useRawRequest, rawRequestValue]);

  // Note to Michael: don't dedent this, we want to preserve JSON formatting.
  const placeholderText = `Enter your HTTP request here. Example:

POST /v1/chat/completions HTTP/1.1
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

  // Add effect to handle forceStructured changes
  useEffect(() => {
    if (forceStructured) {
      // Reset all state to structured mode
      setUseRawRequest(false);
      setRawRequestValue('');
      // Clear any validation errors
      setUrlError(null);
      setBodyError(null);

      setHeaders(
        Object.entries(selectedTarget.config.headers || {}).map(([key, value]) => ({
          key,
          value: String(value),
        })),
      );
      setRequestBody(
        typeof selectedTarget.config.body === 'string'
          ? selectedTarget.config.body
          : JSON.stringify(selectedTarget.config.body, null, 2) || '',
      );

      // Only update the target config if we need to clear the raw request
      if (selectedTarget.config.request) {
        updateCustomTarget('request', undefined);
      }
    }
  }, [forceStructured, selectedTarget.config]);

  const handleGenerateConfig = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('https://api.promptfoo.app/http-provider-generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestExample: request,
          responseExample: response,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
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
        setUseRawRequest(true);
        setRawRequestValue(generatedConfig.config.request);
        updateCustomTarget('request', generatedConfig.config.request);
      } else {
        setUseRawRequest(false);
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
      if (generatedConfig.config.transformResponse) {
        updateCustomTarget('transformResponse', generatedConfig.config.transformResponse);
      }
      setConfigDialogOpen(false);
    }
  };

  const handleTryExample = () => {
    setForceStructured(true);
    updateFullTarget({
      ...EXAMPLE_TARGET,
      config: {
        ...EXAMPLE_TARGET.config,
        request: undefined, // Ensure raw request is cleared
      },
    });
  };

  return (
    <Box mt={2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">HTTP Endpoint Configuration</Typography>
        <Box>
          <Button variant="outlined" onClick={handleTryExample} sx={{ mr: 2 }}>
            Try Example
          </Button>
          <Button variant="outlined" onClick={() => setConfigDialogOpen(true)}>
            Generate Config
          </Button>
        </Box>
      </Box>
      <FormControlLabel
        control={
          <Switch
            checked={useRawRequest}
            onChange={(e) => {
              const enabled = e.target.checked;
              resetState(enabled);
              setUseRawRequest(enabled);
            }}
          />
        }
        label="Use Raw HTTP Request"
        sx={{ mb: 2, display: 'block' }}
      />
      {useRawRequest ? (
        <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
          <Editor
            value={rawRequestValue}
            onValueChange={handleRawRequestChange}
            highlight={(code) => highlight(code, languages.http)}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              backgroundColor: darkMode ? '#1e1e1e' : '#f5f5f5',
              borderRadius: 4,
              minHeight: '10rem',
            }}
            placeholder={placeholderText}
          />
          {bodyError && (
            <Typography color="error" variant="body2" sx={{ mt: 1 }}>
              {bodyError}
            </Typography>
          )}
        </Box>
      ) : (
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
              borderColor: bodyError ? 'error.main' : 'grey.300',
              borderRadius: 1,
              mt: 1,
              position: 'relative',
              backgroundColor: darkMode ? '#1e1e1e' : '#fff',
            }}
          >
            <Editor
              value={
                typeof requestBody === 'object'
                  ? JSON.stringify(requestBody, null, 2)
                  : requestBody || ''
              }
              onValueChange={handleRequestBodyChange}
              highlight={(code) =>
                highlight(code, isJsonContentType ? languages.json : languages.text)
              }
              padding={10}
              style={{
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 14,
                minHeight: '100px',
              }}
            />
          </Box>
          {bodyError && (
            <Typography color="error" variant="caption" sx={{ mt: 0.5 }}>
              {bodyError}
            </Typography>
          )}
        </Box>
      )}
      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Generate HTTP Configuration</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Example Request
              </Typography>
              <Paper elevation={3} sx={{ height: '300px', overflow: 'auto' }}>
                <Editor
                  value={request}
                  onValueChange={(val) => setRequest(val)}
                  highlight={(code) => highlight(code, languages.http)}
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
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Example Response
              </Typography>
              <Paper elevation={3} sx={{ height: '300px', overflow: 'auto' }}>
                <Editor
                  value={response}
                  onValueChange={(val) => setResponse(val)}
                  highlight={(code) => highlight(code, languages.json)}
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
              <Grid item xs={12}>
                <Typography color="error">Error: {error}</Typography>
              </Grid>
            )}
            {generatedConfig && (
              <Grid item xs={12}>
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
                    highlight={(code) => highlight(code, languages.yaml)}
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
    </Box>
  );
};

export default HttpEndpointConfiguration;
