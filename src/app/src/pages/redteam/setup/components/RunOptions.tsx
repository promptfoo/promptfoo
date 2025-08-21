import React, { useState } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { FormControlLabel, Switch } from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Config } from '../types';
import type { RedteamRunOptions } from '@promptfoo/types';

const LabelWithTooltip = ({ label, tooltip }: { label: string; tooltip: string }) => {
  return (
    <Tooltip title={tooltip}>
      <span style={{ textDecoration: 'underline dotted' }}>{label}</span>
    </Tooltip>
  );
};

interface RunOptionsProps {
  numTests: number | undefined;
  runOptions?: Partial<RedteamRunOptions>;
  updateConfig: (section: keyof Config, value: any) => void;
  updateRunOption: (key: keyof RedteamRunOptions, value: any) => void;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
  useGuardrailAssertion?: boolean;
}

export const RunOptions: React.FC<RunOptionsProps> = ({
  numTests,
  runOptions,
  updateConfig,
  updateRunOption,
  useGuardrailAssertion,
}) => {
  // These two settings are mutually exclusive
  const canSetDelay = Boolean(!runOptions?.maxConcurrency || runOptions?.maxConcurrency === 1);

  const canSetMaxConcurrency = Boolean(!runOptions?.delay || runOptions?.delay === 0);
  const [expanded, setExpanded] = useState(true);
  return (
    <Box mb={4}>
      <Accordion expanded={expanded} onChange={(e, expanded) => setExpanded(expanded)}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls="run-options-content"
          id="run-options-header"
        >
          <Typography variant="h6">Run Options</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={3}>
            <TextField
              fullWidth
              type="number"
              label="Number of test cases"
              value={numTests ?? 0}
              onChange={(e) => {
                updateConfig('numTests', Number(e.target.value));
              }}
              helperText="Number of test cases to generate for each plugin"
              error={Boolean(Number.isNaN(numTests) || (numTests && numTests < 1))}
            />

            <TextField
              fullWidth
              type="number"
              label={
                canSetDelay ? (
                  'Delay between API calls (ms)'
                ) : (
                  <LabelWithTooltip
                    label="Delay between API calls (ms)"
                    tooltip="To set a delay, you must set the number of concurrent requests to 1."
                  />
                )
              }
              value={runOptions?.delay ?? 0}
              disabled={!canSetDelay}
              onChange={(e) => {
                const value = e.target.value;
                if (value == '' || (!Number.isNaN(Number(value)) && Number(value) >= 0)) {
                  updateRunOption('delay', Number(value));
                  updateRunOption('maxConcurrency', 1);
                } else {
                  updateRunOption('delay', 0);
                }
              }}
              InputProps={{
                endAdornment: (
                  <Box sx={{ pl: 1 }}>
                    <Typography variant="caption">ms</Typography>
                  </Box>
                ),
              }}
              helperText="Add a delay between API calls to avoid rate limits. This will not override a delay set on the target."
            />
            <TextField
              fullWidth
              type="number"
              label={
                canSetMaxConcurrency ? (
                  'Max number of concurrent requests'
                ) : (
                  <LabelWithTooltip
                    label="Max number of concurrent requests"
                    tooltip="To set a max concurrency, you must set the delay to 0."
                  />
                )
              }
              value={runOptions?.maxConcurrency ?? 1}
              disabled={!canSetMaxConcurrency}
              onChange={(e) => {
                const value = e.target.value;

                if (!Number.isNaN(Number(value)) && Number(value) > 0) {
                  updateRunOption('maxConcurrency', Number(value));
                  updateRunOption('delay', 0);
                } else {
                  updateRunOption('maxConcurrency', 1);
                }
              }}
              InputProps={{
                endAdornment: (
                  <Box sx={{ pl: 1 }}>
                    <Typography variant="caption">requests</Typography>
                  </Box>
                ),
              }}
              helperText="The maximum number of concurrent requests to make to the target."
            />

            <FormControlLabel
              control={
                <Switch
                  checked={runOptions?.verbose}
                  onChange={(e) => updateRunOption('verbose', e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body1">Debug mode</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Show additional debug information in logs
                  </Typography>
                </Box>
              }
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
