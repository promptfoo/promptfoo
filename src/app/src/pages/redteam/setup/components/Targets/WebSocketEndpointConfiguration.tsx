import { useState } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import { Switch } from '@mui/material';
import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import dedent from 'dedent';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';
import {
  DEFAULT_WEBSOCKET_STREAM_RESPONSE,
  DEFAULT_WEBSOCKET_TIMEOUT_MS,
  DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE,
} from './consts';

import type { ProviderOptions } from '../../types';

interface WebSocketEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateWebSocketTarget: (field: string, value: any) => void;
  urlError: string | null;
}

const highlightJS = (code: string): string => {
  try {
    const grammar = Prism?.languages?.javascript;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'javascript');
  } catch {
    return code;
  }
};

const WebSocketEndpointConfiguration = ({
  selectedTarget,
  updateWebSocketTarget,
  urlError,
}: WebSocketEndpointConfigurationProps) => {
  const [streamResponse, setStreamResponse] = useState(
    Boolean(selectedTarget.config.streamResponse),
  );
  return (
    <Box mt={2}>
      <Typography variant="h6" gutterBottom>
        Custom WebSocket Endpoint Configuration
      </Typography>
      <Box mt={2} p={2} border={1} borderColor="grey.300" borderRadius={1}>
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
        />

        <BaseNumberInput
          fullWidth
          margin="normal"
          label="Timeout (ms)"
          onBlur={() => {
            if (
              selectedTarget.config.timeoutMs === undefined ||
              Number.isNaN(selectedTarget.config.timeoutMs)
            ) {
              updateWebSocketTarget(
                'timeoutMs',
                selectedTarget.config.timeoutMs || DEFAULT_WEBSOCKET_TIMEOUT_MS,
              );
            }
          }}
          value={selectedTarget.config.timeoutMs}
          onChange={(val) => updateWebSocketTarget('timeoutMs', val)}
        />
        <InputLabel htmlFor="stream-response" sx={{ mt: 2 }}>
          Stream Response
        </InputLabel>
        <FormHelperText id="stream-response-indicator">
          Configure your WebSocket to stream responses instead of returning a single response per
          prompt.
        </FormHelperText>
        <Switch
          value={streamResponse}
          checked={streamResponse}
          onChange={(_, checked) => {
            setStreamResponse(checked);
            if (checked) {
              updateWebSocketTarget('streamResponse', DEFAULT_WEBSOCKET_STREAM_RESPONSE);
              updateWebSocketTarget('transformResponse', undefined);
            } else {
              updateWebSocketTarget('transformResponse', DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE);
              updateWebSocketTarget('streamResponse', undefined);
            }
          }}
        />
        {streamResponse ? (
          <>
            <InputLabel htmlFor="stream-response" sx={{ mt: 2 }}>
              Stream Response Transform
            </InputLabel>
            <FormHelperText id="stream-response-helper-text">
              Extract specific data from the WebSocket messages. See{' '}
              <a
                href="https://www.promptfoo.dev/docs/providers/websocket/#streaming-responses"
                target="_blank"
              >
                docs
              </a>{' '}
              for more information.
            </FormHelperText>
            <Box
              sx={{
                border: 1,
                my: 1,
                borderColor: 'divider',
                borderRadius: 1,
                position: 'relative',
                backgroundColor: (theme) => (theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff'),
              }}
            >
              <Editor
                id="stream-response"
                aria-describedby="stream-response-helper-text"
                value={selectedTarget.config.streamResponse ?? DEFAULT_WEBSOCKET_STREAM_RESPONSE}
                onValueChange={(code) => updateWebSocketTarget('streamResponse', code)}
                highlight={highlightJS}
                padding={10}
                placeholder={dedent`Optional: Accumulate/Transform streaming WebSocket responses.
            Provide a function that receives (accumulator, event, context) and
            returns [nextAccumulator, isComplete]. Example:

            ${DEFAULT_WEBSOCKET_STREAM_RESPONSE}`}
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 14,
                  minHeight: '150px',
                }}
              />
            </Box>
          </>
        ) : (
          <TextField
            fullWidth
            label="Response Transform"
            value={selectedTarget.config.transformResponse}
            onChange={(e) => updateWebSocketTarget('transformResponse', e.target.value)}
            margin="normal"
          />
        )}
      </Box>
    </Box>
  );
};

export default WebSocketEndpointConfiguration;
