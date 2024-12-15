import { Editor } from '@monaco-editor/react';
import React, { useState } from 'react';
import { Box, Button, Grid, Paper, Typography } from '@mui/material';
import { dump as yamlDump } from 'js-yaml';

interface HttpConfigGeneratorProps {
  className?: string;
}

export function HttpConfigGenerator({ className }: HttpConfigGeneratorProps): JSX.Element {
  const [request, setRequest] = useState(
    `POST /v1/weather HTTP/1.1
Host: api.weather-example.com
Content-Type: application/json

{
  "location": "{{prompt}}",
  "units": "metric",
  "include_forecast": true
}`,
  );
  const [response, setResponse] = useState(
    `{
  "location": "San Francisco, CA",
  "current": {
    "temperature": 18,
    "conditions": "Partly cloudy",
    "humidity": 75,
    "wind_speed": 12
  },
  "forecast": {
    "tomorrow": {
      "high": 20,
      "low": 14,
      "conditions": "Sunny"
    }
  }
}`,
  );
  const [config, setConfig] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('https://api.promptfoo.app/http-config-generator', {
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
        yamlDump(
          {
            providers: [
              {
                id: data.id,
                ...data.config,
              },
            ],
          },
          {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
          },
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
              Generated HTTP Configuration
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
