import React, { useState, useEffect, useCallback } from 'react';
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
import yaml from 'js-yaml';
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
  updateHeaderKey: (index: number, newKey: string) => void;
  updateHeaderValue: (index: number, newValue: string) => void;
  addHeader: () => void;
  removeHeader: (index: number) => void;
  requestBody: string | object;
  setRequestBody: (value: string) => void;
  bodyError: string | null;
  setBodyError: (error: string | null) => void;
  urlError: string | null;
  setUrlError: (error: string | null) => void;
  isJsonContentType: boolean;
  useRawRequest: boolean;
  onRawRequestToggle: (enabled: boolean) => void;
}

const HttpEndpointConfiguration: React.FC<HttpEndpointConfigurationProps> = ({
  selectedTarget,
  updateCustomTarget,
  updateHeaderKey,
  updateHeaderValue,
  addHeader,
  removeHeader,
  requestBody,
  setRequestBody,
  bodyError,
  setBodyError,
  urlError,
  setUrlError,
  isJsonContentType,
  useRawRequest,
  onRawRequestToggle,
}): JSX.Element => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  const resetState = useCallback(
    (isRawMode: boolean) => {
      setBodyError(null);
      setUrlError(null);

      if (isRawMode) {
        // Convert structured request to raw format
        const headers = selectedTarget.config?.headers
          ? Object.entries(selectedTarget.config.headers).map(
              ([key, value]) => `${key}: ${value}`
            )
          : [];

        // Ensure body is properly formatted without double serialization
        let body = selectedTarget.config?.body;
        if (body) {
          if (typeof body === 'string') {
            try {
              // If it's a JSON string, parse it to prevent double serialization
              const parsed = JSON.parse(body);
              body = JSON.stringify(parsed, null, 2);
            } catch {
              // If parsing fails, use the string as-is
              body = body.trim();
            }
          } else {
            // If it's an object, stringify it once
            body = JSON.stringify(body, null, 2);
          }
        }

        const url = selectedTarget.config?.url || 'https://api.example.com/v1/chat/completions';
        const host = new URL(url).host;

        const rawReq = [
          `POST ${url} HTTP/1.1`,
          `Host: ${host}`,
          'Content-Type: application/json',
          ...headers,
          '',
          body || '',
        ].join('\n');

        setRequestBody(rawReq);
        updateCustomTarget('request', rawReq);
      } else {
        // Reset to structured mode with default template
        const template = {
          messages: [
            {
              role: 'user',
              content: '{{prompt}}',
            },
          ],
        };

        setRequestBody(JSON.stringify(template, null, 2));
        updateCustomTarget('body', template);
        updateCustomTarget('headers', {
          'Content-Type': 'application/json',
        });

        // Preserve URL if it exists
        if (selectedTarget.config?.url) {
          updateCustomTarget('url', selectedTarget.config.url);
        }
      }
    },
    [selectedTarget.config, updateCustomTarget, setRequestBody, setBodyError, setUrlError]
  );

  useEffect(() => {
    if (useRawRequest !== undefined) {
      resetState(useRawRequest);
    }
  }, [useRawRequest]); // Remove resetState from dependencies to prevent loop

  useEffect(() => {
    if (!useRawRequest && selectedTarget.config?.request) {
      try {
        // Only attempt to parse if there's a request to parse
        const adjusted = String(selectedTarget.config.request)
          .split(/\r?\n/)
          .filter(Boolean)
          .join('\r\n');

        const parsedRaw = httpZ.parse(adjusted) as unknown;
        const parsed = parsedRaw as {
          method?: string;
          requestLine?: string;
          headers?: Record<string, string | string[]>;
          body?: unknown;
        };

        // Extract URL from request line and headers
        const requestLine = parsed.requestLine?.split(' ');
        if (requestLine && requestLine.length > 1) {
          const url = requestLine[1];
          const host = parsed.headers?.['Host'] || parsed.headers?.['host'];
          if (url.startsWith('/') && host) {
            updateCustomTarget('url', `https://${host}${url}`);
          } else if (url.startsWith('http')) {
            updateCustomTarget('url', url);
          } else if (host) {
            updateCustomTarget('url', `https://${host}${url.startsWith('/') ? '' : '/'}${url}`);
          }
        }

        // Extract method
        if (requestLine && requestLine.length > 0) {
          updateCustomTarget('method', requestLine[0]);
        }

        // Extract headers (excluding Host)
        if (parsed.headers) {
          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(parsed.headers)) {
            if (key.toLowerCase() !== 'host') {
              headers[key] = Array.isArray(value) ? value[0] : String(value);
            }
          }
          updateCustomTarget('headers', headers);
        }

        // Extract and parse body
        if (parsed.body) {
          const bodyStr = String(parsed.body).trim();
          try {
            const parsedBody = JSON.parse(bodyStr);
            setRequestBody(JSON.stringify(parsedBody, null, 2));
            updateCustomTarget('body', parsedBody);
          } catch {
            setRequestBody(bodyStr);
            updateCustomTarget('body', bodyStr);
          }
        }
      } catch (error) {
        console.error('Failed to parse raw request:', error);
        setBodyError(`Failed to parse raw request: ${String(error)}`);
      }
    }
  }, [selectedTarget.config?.request, useRawRequest]); // Remove updateCustomTarget, setRequestBody, setBodyError from dependencies

  const handleRequestBodyChange = (code: string) => {
    setRequestBody(code);

    if (isJsonContentType) {
      try {
        // Try parsing as YAML first
        const parsedYaml = yaml.load(code);
        if (parsedYaml && typeof parsedYaml === 'object') {
          updateCustomTarget('body', parsedYaml);
          setBodyError(null);
          return;
        }
      } catch (yamlError) {
        console.error('YAML parsing failed:', yamlError);
      }

      try {
        // Try parsing as JSON
        const parsedJson = JSON.parse(code);
        updateCustomTarget('body', parsedJson);
        setBodyError(null);
      } catch (jsonError) {
        console.error('JSON parsing failed:', jsonError);
        // Keep the raw string if parsing fails
        updateCustomTarget('body', code);
      }
    } else {
      // For non-JSON content types, use the raw string
      updateCustomTarget('body', code);
    }
  };

  const handleRawRequestChange = (value: string) => {
    try {
      // Split request into headers and body
      const [headersPart, ...bodyParts] = value.split(/\r?\n\r?\n/);
      if (!headersPart || bodyParts.length === 0) {
        throw new Error('Request must include headers and body separated by a blank line');
      }

      // Keep the original body exactly as it was
      const body = bodyParts.join('\n\n');

      // Process headers while preserving the method line
      const headerLines = headersPart.split(/\r?\n/);
      const [methodLine, ...otherHeaders] = headerLines;

      if (!methodLine || !methodLine.includes('HTTP/')) {
        throw new Error('Invalid request line format');
      }

      // Format headers consistently
      const formattedHeaders = otherHeaders.map(header => {
        const [key, ...valueParts] = header.split(':');
        if (!key || valueParts.length === 0) {
          throw new Error('Invalid header format');
        }
        return `${key.trim()}: ${valueParts.join(':').trim()}`;
      });

      // Reconstruct request with minimal formatting
      const formattedRequest = [
        methodLine.trim(),
        ...formattedHeaders,
        '',
        body
      ].join('\n');

      // Validate request format
      const parsed = httpZ.parse(formattedRequest);
      if (!isHttpZRequestModel(parsed)) {
        throw new Error('Invalid HTTP request format');
      }

      // Extract URL from request line
      const match = methodLine.match(/^[A-Z]+ (.+?) HTTP\/\d\.\d$/);
      if (match) {
        const url = match[1].trim();
        try {
          new URL(url); // Validate URL format
          setBodyError(null);
          setRequestBody(formattedRequest);
          updateCustomTarget('request', formattedRequest);
        } catch {
          throw new Error('Invalid URL format');
        }
      } else {
        throw new Error('Invalid request line format');
      }
    } catch (error) {
      console.error('Failed to parse raw request:', error);
      setBodyError(String(error));
    }
  };

  const exampleRequest = `POST https://api.example.com/v1/chat/completions HTTP/1.1
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
                    'Switch to raw HTTP request mode? This will convert your current configuration.',
                  )
                ) {
                  onRawRequestToggle(enabled);
                }
              } else {
                onRawRequestToggle(enabled);
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
            value={selectedTarget.config.request || exampleRequest}
            onValueChange={(value) => {
              updateCustomTarget('request', value);
            }}
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
                typeof requestBody === 'object' ? JSON.stringify(requestBody, null, 2) : requestBody || ''
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
