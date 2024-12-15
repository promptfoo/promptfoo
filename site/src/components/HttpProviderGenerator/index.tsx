import { Editor } from '@monaco-editor/react';
import React, { useState } from 'react';
import { Box, Button, Grid, Paper, Typography } from '@mui/material';

interface HttpProviderGeneratorProps {
  className?: string;
}

export function HttpProviderGenerator({ className }: HttpProviderGeneratorProps): JSX.Element {
  const [request, setRequest] = useState(
    '{\n  "url": "https://api.example.com/chat",\n  "method": "POST",\n  "headers": {\n    "Content-Type": "application/json"\n  },\n  "body": {\n    "messages": [{\n      "role": "user",\n      "content": "{{prompt}}"\n    }]\n  }\n}',
  );
  const [response, setResponse] = useState(
    '{\n  "choices": [{\n    "message": {\n      "content": "Sample response content"\n    }\n  }]\n}',
  );
  const [config, setConfig] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const generateConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('https://api.promptfoo.app/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: JSON.parse(request),
          providerResponse: JSON.parse(response),
          parsedResponse: null,
          error: null,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      setConfig(JSON.stringify(data, null, 2));
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
            HTTP Request Configuration
          </Typography>
          <Paper elevation={3} sx={{ height: '300px' }}>
            <Editor
              height="100%"
              defaultLanguage="json"
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
            Sample Response
          </Typography>
          <Paper elevation={3} sx={{ height: '300px' }}>
            <Editor
              height="100%"
              defaultLanguage="json"
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
          <Button variant="contained" onClick={generateConfig} disabled={loading} sx={{ mr: 2 }}>
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
