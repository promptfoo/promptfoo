import { useCallback, useMemo, useState } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import { COMMON_LANGUAGE_NAMES, normalizeLanguage } from '@app/constants/languages';
import { Autocomplete, Chip, FormControlLabel, Switch, TextField } from '@mui/material';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { Config } from '../types';
import type { RedteamRunOptions } from '@promptfoo/types';

// Shared helper and error text constants for RunOptions inputs
export const RUNOPTIONS_TEXT = {
  numberOfTests: {
    helper: 'Number of test cases to generate for each plugin',
    error: 'Number of test cases must be greater than 0',
  },
  delayBetweenApiCalls: {
    helper:
      'Add a delay between API calls to avoid rate limits. This will not override a delay set on the target.',
    error: 'Delay must be 0 or greater',
  },
  maxConcurrentRequests: {
    helper: 'The maximum number of concurrent requests to make to the target.',
    error: 'Max number of concurrent requests must be greater than 0',
  },
  languages: {
    helper:
      'Specify languages for multilingual test generation. Supports ISO 639-1, ISO 639-2/T, and ISO 639-2/B codes.',
    label: 'Test Languages',
    placeholder: "Type language name or ISO code (e.g., 'French' or 'fr')",
  },
} as const;
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
  language?: string | string[];
}

export interface NumberOfTestCasesInputProps {
  value: string;
  setValue: (value: string) => void;
  updateConfig: (section: keyof Config, value: any) => void;
  readOnly?: boolean;
  defaultNumberOfTests?: number;
}

const isBelowMin = (value: string, min: number) => {
  if (value === '') {
    return false;
  }
  const n = Number(value);
  return Number.isNaN(n) || n < min;
};

/**
 * Number of test cases
 * - Accepts only digits as the user types (temporary empty state allowed)
 * - onBlur clamps to a minimum of 1 and persists via updateConfig
 * - Prevents non-numeric characters like e/E/+/−/.
 */
export const NumberOfTestCasesInput = ({
  value,
  setValue,
  updateConfig,
  readOnly,
  defaultNumberOfTests = REDTEAM_DEFAULTS.NUM_TESTS,
}: NumberOfTestCasesInputProps) => {
  const error = isBelowMin(value, 1) ? RUNOPTIONS_TEXT.numberOfTests.error : undefined;
  return (
    <BaseNumberInput
      fullWidth
      label="Number of test cases"
      value={value}
      min={1}
      onChange={(v) => {
        setValue(v?.toString() || '');
      }}
      onBlur={() => {
        if (readOnly) {
          return;
        }
        if (value === '') {
          updateConfig('numTests', defaultNumberOfTests);
          setValue(defaultNumberOfTests.toString());
          return;
        }
        const parsed = Number(value);
        const safe = Number.isNaN(parsed) || parsed < 1 ? defaultNumberOfTests : parsed;
        updateConfig('numTests', safe);
        setValue(String(safe));
      }}
      slotProps={{
        input: { readOnly },
      }}
      helperText={error ? error : RUNOPTIONS_TEXT.numberOfTests.helper}
      error={Boolean(error)}
    />
  );
};

export interface DelayBetweenAPICallsInputProps {
  value: string;
  setValue: (value: string) => void;
  updateRunOption: (key: keyof RedteamRunOptions, value: any) => void;
  readOnly?: boolean;
  canSetDelay?: boolean;
  setMaxConcurrencyValue: (value: string) => void;
}

/**
 * Delay between API calls (ms)
 * - Enabled only when maxConcurrency is 1 (mutual exclusivity rule)
 * - Accepts only digits; onBlur clamps to ≥ 0 and persists via updateRunOption
 * - If delay > 0, we force maxConcurrency to 1 to uphold exclusivity
 * - Prevents non-numeric characters like e/E/+/−/.
 */
export const DelayBetweenAPICallsInput = ({
  canSetDelay,
  readOnly,
  setValue,
  setMaxConcurrencyValue,
  updateRunOption,
  value,
}: DelayBetweenAPICallsInputProps) => {
  const error = isBelowMin(value, 0) ? RUNOPTIONS_TEXT.delayBetweenApiCalls.error : undefined;
  return (
    <BaseNumberInput
      fullWidth
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
      value={value}
      disabled={!canSetDelay || readOnly}
      onChange={(v) => {
        if (readOnly) {
          return;
        }
        setValue(v?.toString() || '');
      }}
      onBlur={() => {
        if (readOnly) {
          return;
        }
        const parsed = value === '' ? 0 : Number(value);
        const safe = Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
        updateRunOption('delay', safe);
        setValue(String(safe));
        // Enforce mutual exclusivity
        updateRunOption('maxConcurrency', 1);
        setMaxConcurrencyValue('1');
      }}
      min={0}
      slotProps={{
        input: {
          readOnly,
          endAdornment: (
            <Box sx={{ pl: 1 }}>
              <Typography variant="caption">ms</Typography>
            </Box>
          ),
        },
      }}
      helperText={error || RUNOPTIONS_TEXT.delayBetweenApiCalls.helper}
      error={Boolean(error)}
    />
  );
};

export interface MaxNumberOfConcurrentRequestsInputProps {
  value: string;
  setValue: (value: string) => void;
  setDelayValue: (value: string) => void;
  updateRunOption: (key: keyof RedteamRunOptions, value: any) => void;
  readOnly?: boolean;
  canSetMaxConcurrency?: boolean;
}

export const MaxNumberOfConcurrentRequestsInput = ({
  value,
  setValue,
  setDelayValue,
  updateRunOption,
  readOnly,
  canSetMaxConcurrency,
}: MaxNumberOfConcurrentRequestsInputProps) => {
  const error = isBelowMin(value, 1) ? RUNOPTIONS_TEXT.maxConcurrentRequests.error : undefined;
  return (
    <BaseNumberInput
      fullWidth
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
      value={value}
      disabled={!canSetMaxConcurrency || readOnly}
      onChange={(v) => {
        if (readOnly) {
          return;
        }
        setValue(v?.toString() || '');
      }}
      min={1}
      onBlur={() => {
        if (readOnly) {
          return;
        }
        const parsed = value === '' ? 1 : Number(value);
        const safe = Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
        updateRunOption('maxConcurrency', safe);
        setValue(String(safe));
        // Enforce mutual exclusivity
        updateRunOption('delay', 0);
        setDelayValue('0');
      }}
      slotProps={{
        input: {
          readOnly,
          endAdornment: (
            <Box sx={{ pl: 1 }}>
              <Typography variant="caption">requests</Typography>
            </Box>
          ),
        },
      }}
      helperText={error || RUNOPTIONS_TEXT.maxConcurrentRequests.helper}
      error={Boolean(error)}
    />
  );
};

export const RunOptionsContent = ({
  numTests,
  runOptions,
  updateConfig,
  updateRunOption,
  language,
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

  // Normalize language to array for Autocomplete
  const languageArray = useMemo<string[]>(() => {
    if (!language) {
      return [];
    }
    return Array.isArray(language) ? language : [language];
  }, [language]);

  // Handler for language changes
  const handleLanguageChange = useCallback(
    (_event: unknown, newValue: string[]) => {
      // Normalize all language inputs (converts ISO codes to full names)
      const normalized = newValue.map((lang) => normalizeLanguage(lang));
      updateConfig('language', normalized.length > 0 ? normalized : undefined);
    },
    [updateConfig],
  );

  return (
    <Stack spacing={3}>
      <NumberOfTestCasesInput
        value={numTestsInput}
        setValue={setNumTestsInput}
        updateConfig={updateConfig}
      />

      <DelayBetweenAPICallsInput
        value={delayInput}
        setValue={setDelayInput}
        updateRunOption={updateRunOption}
        readOnly={!canSetDelay}
        canSetDelay={canSetDelay}
        setMaxConcurrencyValue={setMaxConcurrencyInput}
      />
      {/**
       * Max number of concurrent requests
       * - Enabled only when delay is 0 (mutual exclusivity rule)
       * - Accepts only digits; onBlur clamps to ≥ 1 and persists via updateRunOption
       * - Any change forces delay to 0 to uphold exclusivity
       * - Prevents non-numeric characters like e/E/+/−/.
       */}
      <MaxNumberOfConcurrentRequestsInput
        value={maxConcurrencyInput}
        setValue={setMaxConcurrencyInput}
        updateRunOption={updateRunOption}
        readOnly={!canSetMaxConcurrency}
        canSetMaxConcurrency={canSetMaxConcurrency}
        setDelayValue={setDelayInput}
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
      <Autocomplete
        multiple
        freeSolo
        options={COMMON_LANGUAGE_NAMES}
        value={languageArray}
        onChange={handleLanguageChange}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const { key, ...tagProps } = getTagProps({ index });
            return <Chip key={key} label={option} {...tagProps} />;
          })
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label={RUNOPTIONS_TEXT.languages.label}
            placeholder={RUNOPTIONS_TEXT.languages.placeholder}
            helperText={RUNOPTIONS_TEXT.languages.helper}
          />
        )}
      />
    </Stack>
  );
};
