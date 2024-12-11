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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">HTTP Endpoint Configuration</Typography>
        <Box>
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
