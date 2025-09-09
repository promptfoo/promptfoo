import React, { useEffect, useState } from 'react';

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
import type { RedteamRunOptions } from '@promptfoo/types';
import { Config } from '../types';

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
  const [numTestsInput, setNumTestsInput] = useState<string>(numTests !== undefined ? String(numTests) : '');
  const [delayInput, setDelayInput] = useState<string>(
    runOptions?.delay !== undefined ? String(runOptions.delay) : '0',
  );
  const [maxConcurrencyInput, setMaxConcurrencyInput] = useState<string>(
    runOptions?.maxConcurrency !== undefined ? String(runOptions.maxConcurrency) : '1',
  );

  useEffect(() => {
    setNumTestsInput(numTests !== undefined ? String(numTests) : '');
  }, [numTests]);

  useEffect(() => {
    if (runOptions?.delay !== undefined) {
      setDelayInput(String(runOptions.delay));
    }
    if (runOptions?.maxConcurrency !== undefined) {
      setMaxConcurrencyInput(String(runOptions.maxConcurrency));
    }
  }, [runOptions?.delay, runOptions?.maxConcurrency]);
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
              value={numTestsInput}
              onChange={(e) => {
                const raw = e.target.value;
                const digitsOnly = raw.replace(/\D/g, '');
                setNumTestsInput(digitsOnly);
              }}
              onBlur={() => {
                if (numTestsInput === '') {
                  updateConfig('numTests', undefined);
                  return;
                }
                const parsed = Number(numTestsInput);
                updateConfig('numTests', parsed);
              }}
              onKeyDown={(e) => {
                if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
              slotProps={{ input: { inputProps: { inputMode: 'numeric', pattern: '[0-9]*' } } }}
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
              value={delayInput}
              disabled={!canSetDelay}
              onChange={(e) => {
                const raw = e.target.value;
                const digitsOnly = raw.replace(/\D/g, '');
                setDelayInput(digitsOnly);
              }}
              onBlur={() => {
                const parsed = delayInput === '' ? 0 : Number(delayInput);
                const safe = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
                updateRunOption('delay', safe);
                setDelayInput(String(safe));
                // Enforce mutual exclusivity
                updateRunOption('maxConcurrency', 1);
                setMaxConcurrencyInput('1');
              }}
              onKeyDown={(e) => {
                if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
              slotProps={{
                input: {
                  endAdornment: (
                    <Box sx={{ pl: 1 }}>
                      <Typography variant="caption">ms</Typography>
                    </Box>
                  ),
                  inputProps: { inputMode: 'numeric', pattern: '[0-9]*', step: 1, min: 0 },
                },
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
              value={maxConcurrencyInput}
              disabled={!canSetMaxConcurrency}
              onChange={(e) => {
                const raw = e.target.value;
                const digitsOnly = raw.replace(/\D/g, '');
                setMaxConcurrencyInput(digitsOnly);
              }}
              onBlur={() => {
                const parsed = maxConcurrencyInput === '' ? 1 : Number(maxConcurrencyInput);
                const safe = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
                updateRunOption('maxConcurrency', safe);
                setMaxConcurrencyInput(String(safe));
                // Enforce mutual exclusivity
                updateRunOption('delay', 0);
                setDelayInput('0');
              }}
              onKeyDown={(e) => {
                if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                  e.preventDefault();
                }
              }}
              slotProps={{
                input: {
                  endAdornment: (
                    <Box sx={{ pl: 1 }}>
                      <Typography variant="caption">requests</Typography>
                    </Box>
                  ),
                  inputProps: { inputMode: 'numeric', pattern: '[0-9]*', step: 1, min: 1 },
                },
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
