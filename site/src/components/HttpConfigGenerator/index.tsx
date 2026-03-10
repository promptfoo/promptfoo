import React, { useState } from 'react';

import { Editor } from '@monaco-editor/react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

interface HttpConfigGeneratorProps {
  className?: string;
}

export function HttpConfigGenerator({ className }: HttpConfigGeneratorProps): React.ReactElement {
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

  return (
    <Box sx={{ my: 4 }} className={className}>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h6" gutterBottom>
            Example Request
          </Typography>
          <Paper elevation={3} sx={{ height: '300px' }}>
            <Editor
              height="100%"
              defaultLanguage="http"
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
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="h6" gutterBottom>
            Example Response
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
      </Grid>
    </Box>
  );
}
