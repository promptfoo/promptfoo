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
  const [rawRequestValue, setRawRequestValue] = useState(selectedTarget.config.request || '');

  const resetState = useCallback(
    (isRawMode: boolean) => {
      setBodyError(null);
      setUrlError(null);

      if (isRawMode) {
        const headers = selectedTarget.config?.headers
          ? Object.entries(selectedTarget.config.headers)
              .filter(
                (entry, index, self) =>
                  self.findIndex(([key]) => key.toLowerCase() === entry[0].toLowerCase()) === index,
              )
              .map(([key, value]) => `${key}: ${value}`)
          : [];

        let body = selectedTarget.config?.body;
        if (body) {
          if (typeof body === 'string') {
            try {
              const parsed = JSON.parse(body);
              body = JSON.stringify(parsed, null, 2);
            } catch {
              body = body.trim();
            }
          } else {
            body = JSON.stringify(body, null, 2);
          }
        }

        const url = selectedTarget.config?.url || 'https://api.example.com/v1/chat/completions';
        const host = new URL(url).host;

        const rawReq = [`POST ${url} HTTP/1.1`, `Host: ${host}`, ...headers, '', body || ''].join(
          '\n',
        );

        setRequestBody(rawReq);
        updateCustomTarget('request', rawReq);
      } else {
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

        if (selectedTarget.config?.url) {
          updateCustomTarget('url', selectedTarget.config.url);
        }
      }
    },
    [selectedTarget.config, updateCustomTarget, setRequestBody, setBodyError, setUrlError],
  );

  useEffect(() => {
    if (useRawRequest !== undefined) {
      resetState(useRawRequest);
    }
  }, [useRawRequest]);

  useEffect(() => {
    if (useRawRequest && rawRequestValue) {
      try {
        const parsed = httpZ.parse(rawRequestValue);
        if (!isHttpZRequestModel(parsed)) {
          setBodyError('Please enter a valid HTTP request');
          return;
        }
        if (!rawRequestValue.includes('{{prompt}}')) {
          setBodyError('Request must contain {{prompt}} template variable');
          return;
        }
        setBodyError(null);
        updateCustomTarget('request', rawRequestValue);
      } catch (error) {
        console.error('Failed to parse raw request:', error);
        setBodyError('Please enter a valid HTTP request');
      }
    }
  }, [useRawRequest, rawRequestValue, updateCustomTarget, setBodyError]);

  const handleRequestBodyChange = (code: string) => {
    setRequestBody(code);

    if (isJsonContentType) {
      try {
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
        const parsedJson = JSON.parse(code);
        updateCustomTarget('body', parsedJson);
        setBodyError(null);
      } catch (jsonError) {
        console.error('JSON parsing failed:', jsonError);
        updateCustomTarget('body', code);
      }
    } else {
      updateCustomTarget('body', code);
    }
  };

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
                  onRawRequestToggle(enabled);
                }
              } else {
                resetState(enabled);
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
            value={rawRequestValue}
            onValueChange={(value) => {
              setRawRequestValue(value);
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
