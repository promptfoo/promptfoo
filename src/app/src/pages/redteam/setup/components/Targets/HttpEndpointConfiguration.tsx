import React, { useEffect, useCallback, useState } from 'react';
import Editor from 'react-simple-code-editor';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import httpZ from 'http-z';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
import type { ProviderOptions } from '../../types';
import 'prismjs/themes/prism.css';

interface HttpZRequestModel {
  raw: string;
  headers?: Record<string, string | string[]>;
  body?: unknown;
}

function isHttpZRequestModel(obj: any): obj is HttpZRequestModel {
  return obj && typeof obj.raw === 'string';
}

interface HttpEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
  bodyError: string | null;
  setBodyError: (error: string | null) => void;
  urlError: string | null;
  setUrlError: (error: string | null) => void;
}

const HttpEndpointConfiguration: React.FC<HttpEndpointConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  bodyError,
  setBodyError,
  urlError,
  setUrlError,
}): JSX.Element => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  // Internal state management
  const [useRawRequest, setUseRawRequest] = useState(!!selectedTarget.config.request);
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

  const convertToRawRequest = (config: any) => {
    const headers = config.headers || {};
    const headerLines = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const method = config.method || 'POST';
    const url = config.url || '/';
    let body = config.body;

    if (body && typeof body === 'object') {
      body = JSON.stringify(body, null, 2);
    } else if (typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        body = JSON.stringify(parsed, null, 2);
      } catch {
        // If it's not valid JSON, keep it as is
      }
    }

    return `${method} ${url} HTTP/1.1\n${headerLines}\n\n${body || ''}`;
  };

  const parseRawRequest = (input: string) => {
    const adjusted = input.trim().replace(/\n/g, '\r\n') + '\r\n\r\n';
    try {
      const messageModel = httpZ.parse(adjusted) as httpZ.HttpZRequestModel;
      return {
        method: messageModel.method,
        url: messageModel.target,
        headers: messageModel.headers.reduce(
          (acc, header) => {
            acc[header.name.toLowerCase()] = header.value;
            return acc;
          },
          {} as Record<string, string>,
        ),
        body: messageModel.body,
      };
    } catch (err) {
      throw new Error(`Error parsing raw HTTP request: ${String(err)}`);
    }
  };

  const resetState = useCallback(
    (isRawMode: boolean) => {
      setBodyError(null);
      setUrlError(null);

      if (isRawMode) {
        const rawReq = convertToRawRequest(selectedTarget.config);
        setRawRequestValue(rawReq);
        updateCustomTarget('request', rawReq);

        // Clear structured mode fields
        updateCustomTarget('url', undefined);
        updateCustomTarget('method', undefined);
        updateCustomTarget('headers', undefined);
        updateCustomTarget('body', undefined);
      } else {
        if (selectedTarget.config.request) {
          try {
            const parsed = parseRawRequest(selectedTarget.config.request);
            updateCustomTarget('url', parsed.url);
            updateCustomTarget('method', parsed.method);
            updateCustomTarget('headers', parsed.headers);
            updateCustomTarget('body', parsed.body);

            setHeaders(
              Object.entries(parsed.headers || {}).map(([key, value]) => ({
                key,
                value: String(value),
              })),
            );

            if (parsed.body) {
              const bodyStr = String(parsed.body).trim();
              try {
                const parsedBody = JSON.parse(bodyStr);
                setRequestBody(JSON.stringify(parsedBody, null, 2));
              } catch {
                setRequestBody(bodyStr);
              }
            }
          } catch {
            setBodyError('Failed to parse HTTP request. Please check the format.');
            return;
          }
        }
        setRawRequestValue('');
        updateCustomTarget('request', undefined);
      }
    },
    [selectedTarget.config, updateCustomTarget, setBodyError, setUrlError],
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
      try {
        const parsed = httpZ.parse(rawRequestValue);
        if (!isHttpZRequestModel(parsed)) {
          setBodyError('Please enter a valid HTTP request');
          return;
        }

        // Check for required template variable
        if (!rawRequestValue.includes('{{prompt}}')) {
          setBodyError('Request must include {{prompt}} template variable');
          return;
        }

        // Check for URL presence without blocking input
        const urlMatch = rawRequestValue.match(/^(POST|GET|PUT|DELETE)\s+(\S+)/);
        if (!urlMatch) {
          setBodyError('Please include a URL in your request');
          return;
        }

        setBodyError(null);
      } catch {
        // Only show format error for longer content
        if (rawRequestValue.trim().length > 50) {
          setBodyError('Please check your request format');
        } else {
          setBodyError(null);
        }
      }
    }, 750); // Increased debounce time for better typing experience

    return () => clearTimeout(timeoutId);
  }, [useRawRequest, rawRequestValue]);

  const placeholderText = `Enter your HTTP request here. Example:
POST https://api.example.com/v1/chat/completions HTTP/1.1
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

  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom>
        HTTP Endpoint Configuration
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={useRawRequest}
            onChange={(e) => {
              const enabled = e.target.checked;
              if (enabled && !selectedTarget.config.request) {
                if (
                  window.confirm(
                    'Switch to raw HTTP request mode? This will reset your current configuration.',
                  )
                ) {
                  resetState(enabled);
                  setUseRawRequest(enabled);
                }
              } else {
                resetState(enabled);
                setUseRawRequest(enabled);
              }
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
    </Box>
  );
};

export default HttpEndpointConfiguration;
