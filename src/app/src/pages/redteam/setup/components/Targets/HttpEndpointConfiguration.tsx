import React, { useCallback, useState } from 'react';
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
import './syntax-highlighting.css';

interface HttpEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  bodyError: string | null;
  setBodyError: (error: string | null) => void;
  urlError: string | null;
  setUrlError: (error: string | null) => void;
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
    transformRequest?: string;
    transformResponse?: string;
    sessionParser?: string;
  };
}

const HttpEndpointConfiguration: React.FC<HttpEndpointConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  bodyError,
  setBodyError,
  urlError,
  setUrlError,
  updateFullTarget,
}): JSX.Element => {
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
    updateCustomTarget('body', content);
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
      const res = await fetch('https://api.promptfoo.app/api/http-provider-generator', {
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

  return (
    <Box>
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
        sx={{ mb: 2, display: 'block' }}
      />
      {selectedTarget.config.request ? (
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
          <Editor
            value={selectedTarget.config.request || ''}
            onValueChange={handleRawRequestChange}
            highlight={(code) => highlight(code, languages.http)}
            padding={10}
            style={{
              fontFamily: '"Fira code", "Fira Mono", monospace',
              fontSize: 14,
              backgroundColor: 'transparent',
              color: theme.palette.text.primary,
            }}
            placeholder={placeholderText}
            className={theme.palette.mode === 'dark' ? 'dark-syntax' : ''}
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
