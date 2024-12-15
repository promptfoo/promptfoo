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
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-http';
import 'prismjs/components/prism-json';
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
}

const HttpEndpointConfiguration: React.FC<HttpEndpointConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  bodyError,
  setBodyError,
  urlError,
  setUrlError,
  forceStructured,
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
    </Box>
  );
};

export default HttpEndpointConfiguration;
