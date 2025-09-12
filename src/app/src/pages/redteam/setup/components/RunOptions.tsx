import { useState } from 'react';

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
import InputAdornment from '@mui/material/InputAdornment';
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

export const RunOptionsContent = ({
  numTests,
  runOptions,
  updateConfig,
  updateRunOption,
  useGuardrailAssertion,
}: RunOptionsProps) => {
  // These two settings are mutually exclusive
  const canSetDelay = Boolean(!runOptions?.maxConcurrency || runOptions?.maxConcurrency === 1);

  const canSetMaxConcurrency = Boolean(!runOptions?.delay || runOptions?.delay === 0);
  const [numTestsInput, setNumTestsInput] = useState<string>(
    numTests !== undefined ? String(numTests) : '0',
  );
  const [delayInput, setDelayInput] = useState<string>(
    runOptions?.delay !== undefined ? String(runOptions.delay) : '0',
  );
  const [maxConcurrencyInput, setMaxConcurrencyInput] = useState<string>(
    runOptions?.maxConcurrency !== undefined ? String(runOptions.maxConcurrency) : '1',
  );
  return (
    <Stack spacing={3}>
      {/**
       * Number of test cases
       * - Accepts only digits as the user types (temporary empty state allowed)
       * - onBlur clamps to a minimum of 1 and persists via updateConfig
       * - Prevents non-numeric characters like e/E/+/−/.
       */}
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
          const safe = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
          updateConfig('numTests', safe);
          setNumTestsInput(String(safe));
        }}
        onKeyDown={(e) => {
          if (['e', 'E', '+', '-', '.'].includes(e.key)) {
            e.preventDefault();
          }
        }}
        slotProps={{ input: { inputProps: { inputMode: 'numeric', pattern: '[0-9]*' } } }}
        helperText="Number of test cases to generate for each plugin"
        error={(() => {
          if (numTestsInput === '') {
            return false;
          }
          const n = Number(numTestsInput);
          return Number.isNaN(n) || n < 1;
        })()}
      />

      {/**
       * Delay between API calls (ms)
       * - Enabled only when maxConcurrency is 1 (mutual exclusivity rule)
       * - Accepts only digits; onBlur clamps to ≥ 0 and persists via updateRunOption
       * - If delay > 0, we force maxConcurrency to 1 to uphold exclusivity
       * - Prevents non-numeric characters like e/E/+/−/.
       */}
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
          // Enforce mutual exclusivity only when delay > 0
          if (safe > 0) {
            updateRunOption('maxConcurrency', 1);
            setMaxConcurrencyInput('1');
          }
        }}
        onKeyDown={(e) => {
          if (['e', 'E', '+', '-', '.'].includes(e.key)) {
            e.preventDefault();
          }
        }}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <Typography variant="caption">ms</Typography>
              </InputAdornment>
            ),
            inputProps: { inputMode: 'numeric', pattern: '[0-9]*', step: 1, min: 0 },
          },
        }}
        helperText="Add a delay between API calls to avoid rate limits. This will not override a delay set on the target."
        error={(() => {
          if (delayInput === '') {
            return false;
          }
          const n = Number(delayInput);
          return Number.isNaN(n) || n < 0;
        })()}
      />

      {/**
       * Max number of concurrent requests
       * - Enabled only when delay is 0 (mutual exclusivity rule)
       * - Accepts only digits; onBlur clamps to ≥ 1 and persists via updateRunOption
       * - Any change forces delay to 0 to uphold exclusivity
       * - Prevents non-numeric characters like e/E/+/−/.
       */}
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
              <InputAdornment position="end">
                <Typography variant="caption">requests</Typography>
              </InputAdornment>
            ),
            inputProps: { inputMode: 'numeric', pattern: '[0-9]*', step: 1, min: 1 },
          },
        }}
        helperText="The maximum number of concurrent requests to make to the target."
        error={(() => {
          if (maxConcurrencyInput === '') {
            return false;
          }
          const n = Number(maxConcurrencyInput);
          return Number.isNaN(n) || n < 1;
        })()}
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
  );
};

export const RunOptions = (props: RunOptionsProps) => {
  const [expanded, setExpanded] = useState(true);

  const normalizedProps: RunOptionsProps = {
    ...props,
    numTests: props.numTests ?? 0,
    runOptions: {
      delay: props.runOptions?.delay ?? 0,
      maxConcurrency: props.runOptions?.maxConcurrency ?? 5,
      verbose: props.runOptions?.verbose,
    },
  };

  return (
    <Box mb={4}>
      <Accordion expanded={expanded} onChange={(e, next) => setExpanded(next)}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          aria-controls="run-options-content"
          id="run-options-header"
        >
          <Typography variant="h6">Run Options</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <RunOptionsContent {...normalizedProps} />
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
