import React from 'react';
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
  isJsonContentType,
  useRawRequest,
  onRawRequestToggle,
}): JSX.Element => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  const handleRequestBodyChange = (code: string) => {
    setRequestBody(code);

    if (isJsonContentType) {
      try {
        const parsedYaml = yaml.load(code);
        updateCustomTarget('body', parsedYaml);
      } catch (yamlError) {
        console.error('YAML parsing failed:', yamlError);
        try {
          const parsedJson = JSON.parse(code);
          updateCustomTarget('body', parsedJson);
        } catch (jsonError) {
          console.error('JSON parsing failed:', jsonError);
          updateCustomTarget('body', code);
        }
      }
    } else {
      updateCustomTarget('body', code);
    }
  };

  const handleRawRequestChange = (code: string) => {
    try {
      const adjusted = code.trim().replace(/\n/g, '\r\n') + '\r\n\r\n';
      httpZ.parse(adjusted);

      if (code.includes('{{prompt}}')) {
        setBodyError(null);
        updateCustomTarget('request', code);
      } else {
        setBodyError('Request must contain {{prompt}} template variable');
      }
    } catch (err) {
      const errorMessage = String(err)
        .replace(/^Error:\s*/, '')
        .replace(/\bat\b.*$/, '')
        .trim();
      setBodyError(`Invalid HTTP request format: ${errorMessage}`);
    }
  };

  const exampleRequest = `POST /v1/completions HTTP/1.1
Host: api.example.com
Content-Type: application/json
Authorization: Bearer {{api_key}}

{
  "model": "gpt-3.5-turbo",
  "prompt": "{{prompt}}",
  "max_tokens": 100
}`;

  const placeholderText = `# Example HTTP/1.1 Request Format:
# Method Path HTTP/1.1
# Header-Name: Header-Value
#
# Request Body (if any)

${exampleRequest}`;

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
      />
      {useRawRequest ? (
        <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
          <Typography variant="subtitle1" gutterBottom>
            Raw HTTP Request
          </Typography>
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mb: 1,
              color: (theme) => theme.palette.text.secondary,
            }}
          >
            Use HTTP/1.1 format. Include {'{{'} prompt {'}}'} where you want the prompt to be
            inserted. You can also use {'{{'} api_key {'}}'} for authentication tokens.
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
              value={selectedTarget.config.request || placeholderText}
              onValueChange={handleRawRequestChange}
              highlight={(code) => highlight(code, languages.http)}
              padding={10}
              style={{
                fontFamily: '"Fira code", "Fira Mono", monospace',
                fontSize: 14,
                minHeight: '200px',
              }}
              placeholder="Enter your HTTP/1.1 request here..."
            />
          </Box>
          {bodyError && (
            <Typography color="error" variant="caption" sx={{ mt: 0.5, display: 'block' }}>
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
                typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody, null, 2)
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
