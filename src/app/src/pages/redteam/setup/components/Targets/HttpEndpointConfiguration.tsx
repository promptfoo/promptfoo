import React from 'react';
import Editor from 'react-simple-code-editor';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import yaml from 'js-yaml';
// @ts-expect-error: No types available
import { highlight, languages } from 'prismjs/components/prism-core';
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
  urlError: string | null;
  isJsonContentType: boolean;
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
  urlError,
  isJsonContentType,
}) => {
  const theme = useTheme();
  const darkMode = theme.palette.mode === 'dark';

  const handleRequestBodyChange = (code: string) => {
    setRequestBody(code);

    if (isJsonContentType) {
      // Try to parse as YAML first
      try {
        const parsedYaml = yaml.load(code);
        // If it's valid YAML, convert to JSON and update
        // Don't stringify the parsed object - send it as is
        updateCustomTarget('body', parsedYaml);
      } catch (yamlError) {
        console.error('YAML parsing failed:', yamlError);
        // If YAML parsing fails, try JSON parse as fallback
        try {
          const parsedJson = JSON.parse(code);
          updateCustomTarget('body', parsedJson);
        } catch (jsonError) {
          console.error('JSON parsing failed:', jsonError);
          // If both YAML and JSON parsing fail, use the raw text
          updateCustomTarget('body', code);
        }
      }
    } else {
      // For non-JSON content types, use raw text
      updateCustomTarget('body', code);
    }
  };

  return (
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
              /*
              Should always be a string, but there might be some bad state in localStorage as of 2024-12-07
              */
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
    </Box>
  );
};

export default HttpEndpointConfiguration;
