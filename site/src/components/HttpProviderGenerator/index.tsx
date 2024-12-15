import { Editor } from '@monaco-editor/react';
import React, { useState } from 'react';
import { Box, Button, Grid, Paper, Typography } from '@mui/material';

interface HttpProviderGeneratorProps {
  className?: string;
}

export function HttpProviderGenerator({ className }: HttpProviderGeneratorProps): JSX.Element {
  const [request, setRequest] = useState('Example request with {{prompt}} template variable');
  const [response, setResponse] = useState('Example response that would be returned by the API');
  const [config, setConfig] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
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
      setConfig(
        JSON.stringify(
          {
            providers: [
              {
                id: data.id,
                ...data.config,
              },
            ],
          },
          null,
          2,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ my: 4 }} className={className}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Typography variant="h6" gutterBottom>
            Example Request
          </Typography>
          <Paper elevation={3} sx={{ height: '300px' }}>
            <Editor
              height="100%"
              defaultLanguage="plaintext"
              value={request}
              onChange={(val) => setRequest(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="h6" gutterBottom>
            Example Response
          </Typography>
          <Paper elevation={3} sx={{ height: '300px' }}>
            <Editor
              height="100%"
              defaultLanguage="plaintext"
              value={response}
              onChange={(val) => setResponse(val || '')}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </Paper>
        </Grid>
        <Grid item xs={12}>
          <Button variant="contained" onClick={handleSubmit} disabled={loading} sx={{ mr: 2 }}>
            {loading ? 'Generating...' : 'Generate Configuration'}
          </Button>
        </Grid>
        {error && (
          <Grid item xs={12}>
            <Typography color="error" sx={{ mt: 2 }}>
              Error: {error}
            </Typography>
          </Grid>
        )}
        {config && (
          <Grid item xs={12}>
            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
              Generated Configuration
            </Typography>
            <Paper elevation={3} sx={{ height: '200px' }}>
              <Editor
                height="100%"
                defaultLanguage="yaml"
                value={config}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
