import React from 'react';
import {
  Paper,
  Typography,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Alert,
} from '@mui/material';

interface SystemConfigurationProps {
  isStatefulValue: boolean;
  onStatefulChange: (val: boolean) => void;
  hasSessionParser: boolean;
}

export function SystemConfiguration({
  isStatefulValue,
  onStatefulChange,
  hasSessionParser,
}: SystemConfigurationProps) {
  return (
    <Paper elevation={1} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        System Configuration
      </Typography>
      <FormControl component="fieldset">
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Is the target system Stateful? (Does it maintain conversation history?)
        </Typography>
        <RadioGroup
          value={String(isStatefulValue)}
          onChange={(e) => onStatefulChange(e.target.value === 'true')}
        >
          <FormControlLabel
            value="true"
            control={<Radio />}
            label="Yes - System is stateful, system maintains conversation history."
          />
          <FormControlLabel
            value="false"
            control={<Radio />}
            label="No - System does not maintain conversation history"
          />
        </RadioGroup>

        {!hasSessionParser && isStatefulValue && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Your system is stateful but you don't have session handling set up. Please return to
            your Target setup to configure it.
          </Alert>
        )}
      </FormControl>
    </Paper>
  );
}
