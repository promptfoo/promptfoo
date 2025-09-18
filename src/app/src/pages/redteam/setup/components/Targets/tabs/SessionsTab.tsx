import React from 'react';
import Alert from '@mui/material/Alert';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { ProviderOptions } from '@promptfoo/types';

interface SessionsTabProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: any) => void;
}

const SessionsTab: React.FC<SessionsTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  return (
    <>
      <Typography variant="body1" sx={{ mb: 2 }}>
        Extract session IDs from HTTP response headers or the body for stateful systems. See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#session-management"
          target="_blank"
        >
          docs
        </a>{' '}
        for more information.
      </Typography>

      <Stack spacing={2}>
        <FormControl>
          <RadioGroup
            value={selectedTarget.config.sessionSource || 'server'}
            onChange={(e) => {
              updateCustomTarget('sessionSource', e.target.value);
              if (e.target.value === 'client') {
                updateCustomTarget('sessionParser', undefined);
              }
            }}
          >
            <FormControlLabel
              value="server"
              control={<Radio />}
              label="Server-generated Session ID"
            />
            <FormControlLabel
              value="client"
              control={<Radio />}
              label="Client-generated Session ID"
            />
          </RadioGroup>
        </FormControl>

        {selectedTarget.config.sessionSource === 'server' ||
        selectedTarget.config.sessionSource == null ? (
          <TextField
            fullWidth
            label="Session Parser"
            value={selectedTarget.config.sessionParser}
            placeholder="Optional: Enter a Javascript expression to extract the session ID"
            onChange={(e) => updateCustomTarget('sessionParser', e.target.value)}
            margin="normal"
            InputLabelProps={{
              shrink: true,
            }}
          />
        ) : (
          <Alert severity="info">
            A UUID will be created for each conversation and stored in the `sessionId`
            variable. Add {'{{'}sessionId{'}}'}in the header or body of the request above.
          </Alert>
        )}
      </Stack>
    </>
  );
};

export default SessionsTab;