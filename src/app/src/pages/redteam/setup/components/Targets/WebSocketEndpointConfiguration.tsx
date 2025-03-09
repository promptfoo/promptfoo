import React, { useState } from 'react';
import Editor from 'react-simple-code-editor';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import {
  Box,
  Typography,
  TextField,
  Switch,
  FormControlLabel,
  Paper,
  Tooltip,
  IconButton,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import dedent from 'dedent';
import { highlight, languages } from 'prismjs/components/prism-core';
import 'prismjs/components/prism-javascript';
import type { ProviderOptions } from '../../types';
import CodeEditor from './CodeEditor';

interface WebSocketEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateWebSocketTarget: (field: string, value: any) => void;
  urlError: string | null;
}

const WebSocketEndpointConfiguration: React.FC<WebSocketEndpointConfigurationProps> = ({
  selectedTarget,
  updateWebSocketTarget,
  urlError,
}) => {
  const [useAdvancedTransform, setUseAdvancedTransform] = useState(
    typeof selectedTarget.config.transformResponse === 'function',
  );

  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom>
        Custom WebSocket Endpoint Configuration
      </Typography>
      <Box mt={2} p={2} component={Paper} variant="outlined">
        <TextField
          fullWidth
          label="WebSocket URL"
          value={selectedTarget.config.url}
          onChange={(e) => updateWebSocketTarget('url', e.target.value)}
          margin="normal"
          error={!!urlError}
          helperText={urlError}
        />

        <TextField
          fullWidth
          label="Message Template"
          value={selectedTarget.config.messageTemplate}
          onChange={(e) => updateWebSocketTarget('messageTemplate', e.target.value)}
          margin="normal"
          multiline
          rows={3}
          helperText="Template for formatting messages sent to the WebSocket. Use {{ vars }} for variable substitution."
        />

        <Box mt={2}>
          <FormControlLabel
            control={
              <Switch
                checked={useAdvancedTransform}
                onChange={(e) => setUseAdvancedTransform(e.target.checked)}
              />
            }
            label={
              <Tooltip title="Switch between simple string output and advanced JS transformation">
                <Typography>Use Advanced Transform</Typography>
              </Tooltip>
            }
          />

          {useAdvancedTransform ? (
            <CodeEditor
              label="Response Transform Function"
              value={selectedTarget.config.transformResponse || ''}
              onChange={(code) => updateWebSocketTarget('transformResponse', code)}
              placeholder={dedent`
                // Transform the WebSocket response
                if (!data || typeof data !== 'object') {
                  return { output: 'Invalid response data', history: [] };
                }

                return {
                  output: data.output || (data.error && \`Error: \${data.error}\`) || 'No output found',
                  history: data.history || []
                };
              `}
            />
          ) : (
            <TextField
              fullWidth
              label="Response Transform"
              value={selectedTarget.config.transformResponse}
              onChange={(e) => updateWebSocketTarget('transformResponse', e.target.value)}
              margin="normal"
              helperText="Simple transform to extract response text (e.g., 'data.output')"
            />
          )}
        </Box>

        <CodeEditor
          label="Conversation Context Function"
          value={selectedTarget.config.setSessionContext || ''}
          onChange={(code) => updateWebSocketTarget('setSessionContext', code)}
          placeholder={dedent`
            // Get a sessionId from the server
            const response = await fetch('https://example.com/chat', {
              method: 'POST'
            });
            const data = await response.json();
            const sessionId = data.sessionId;

            // Return an object containing vars and optional sessionId
            return {
              vars: {
                specialVar1: foo,
                specialVar2: bar,
              },
              sessionId: vars.sessionId,
            };
          `}
        />

        <TextField
          fullWidth
          label="Timeout (ms)"
          type="number"
          value={selectedTarget.config.timeoutMs}
          onChange={(e) => updateWebSocketTarget('timeoutMs', Number.parseInt(e.target.value))}
          margin="normal"
        />
      </Box>
    </Box>
  );
};

export default WebSocketEndpointConfiguration;
