import { useMemo, useState } from 'react';

import { Label } from '@app/components/ui/label';
import { NumberInput } from '@app/components/ui/number-input';
import { Switch } from '@app/components/ui/switch';
import { TagInput } from '@app/components/ui/tag-input';
import { COMMON_LANGUAGE_NAMES, normalizeLanguage } from '@app/constants/languages';
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

interface RunOptionsProps {
  numTests: number | undefined;
  runOptions?: Partial<RedteamRunOptions>;
  updateConfig: (section: keyof Config, value: Config[keyof Config]) => void;
  updateRunOption: (
    key: keyof RedteamRunOptions,
    value: RedteamRunOptions[keyof RedteamRunOptions],
  ) => void;
  excludeTargetOutputFromAgenticAttackGeneration?: boolean;
  language?: string | string[];
}

export interface NumberOfTestCasesInputProps {
  value: string;
  setValue: (value: string) => void;
  updateConfig: (section: keyof Config, value: Config[keyof Config]) => void;
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
    <NumberInput
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
      readOnly={readOnly}
      helperText={error ? error : RUNOPTIONS_TEXT.numberOfTests.helper}
      error={Boolean(error)}
    />
  );
};

export interface DelayBetweenAPICallsInputProps {
  value: string;
  setValue: (value: string) => void;
  updateRunOption: (
    key: keyof RedteamRunOptions,
    value: RedteamRunOptions[keyof RedteamRunOptions],
  ) => void;
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
  const isDisabled = !canSetDelay || readOnly;
  const disabledReason = 'Set concurrent requests to 1 to enable delay';
  const helperText = canSetDelay
    ? error || RUNOPTIONS_TEXT.delayBetweenApiCalls.helper
    : disabledReason;

  const input = (
    <NumberInput
      fullWidth
      label="Delay between API calls"
      value={value}
      disabled={isDisabled}
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
      readOnly={readOnly}
      endAdornment={<span className="text-xs text-muted-foreground">ms</span>}
      helperText={helperText}
      error={Boolean(error)}
    />
  );

  if (!canSetDelay && !readOnly) {
    return (
      <div title={disabledReason} className="cursor-not-allowed">
        {input}
      </div>
    );
  }

  return input;
};

export interface MaxNumberOfConcurrentRequestsInputProps {
  value: string;
  setValue: (value: string) => void;
  setDelayValue: (value: string) => void;
  updateRunOption: (
    key: keyof RedteamRunOptions,
    value: RedteamRunOptions[keyof RedteamRunOptions],
  ) => void;
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
  const isDisabled = !canSetMaxConcurrency || readOnly;
  const disabledReason = 'Set delay to 0 to enable concurrency';
  const helperText = canSetMaxConcurrency
    ? error || RUNOPTIONS_TEXT.maxConcurrentRequests.helper
    : disabledReason;

  const input = (
    <NumberInput
      fullWidth
      label="Max concurrent requests"
      value={value}
      disabled={isDisabled}
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
      readOnly={readOnly}
      helperText={helperText}
      error={Boolean(error)}
    />
  );

  if (!canSetMaxConcurrency && !readOnly) {
    return (
      <div title={disabledReason} className="cursor-not-allowed">
        {input}
      </div>
    );
  }

  return input;
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

  // Normalize language to array
  const languageArray = useMemo<string[]>(() => {
    if (!language) {
      return [];
    }
    return Array.isArray(language) ? language : [language];
  }, [language]);

  // Handle language changes
  const handleLanguageChange = (newLanguages: string[]) => {
    updateConfig('language', newLanguages.length > 0 ? newLanguages : undefined);
  };

  return (
    <div className="flex flex-col gap-6">
      <NumberOfTestCasesInput
        value={numTestsInput}
        setValue={setNumTestsInput}
        updateConfig={updateConfig}
      />

      <MaxNumberOfConcurrentRequestsInput
        value={maxConcurrencyInput}
        setValue={setMaxConcurrencyInput}
        updateRunOption={updateRunOption}
        canSetMaxConcurrency={canSetMaxConcurrency}
        setDelayValue={setDelayInput}
      />

      <DelayBetweenAPICallsInput
        value={delayInput}
        setValue={setDelayInput}
        updateRunOption={updateRunOption}
        canSetDelay={canSetDelay}
        setMaxConcurrencyValue={setMaxConcurrencyInput}
      />

      <div className="flex items-start gap-3">
        <Switch
          id="debug-mode"
          checked={runOptions?.verbose ?? false}
          onCheckedChange={(checked) => updateRunOption('verbose', checked)}
        />
        <div className="flex flex-col">
          <Label htmlFor="debug-mode" className="cursor-pointer">
            Debug mode
          </Label>
          <span className="text-sm text-muted-foreground">
            Show additional debug information in logs
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{RUNOPTIONS_TEXT.languages.label}</Label>
        <TagInput
          value={languageArray}
          onChange={handleLanguageChange}
          suggestions={COMMON_LANGUAGE_NAMES}
          placeholder={RUNOPTIONS_TEXT.languages.placeholder}
          normalizeValue={normalizeLanguage}
          aria-label={RUNOPTIONS_TEXT.languages.label}
        />
        <span className="text-sm text-muted-foreground">{RUNOPTIONS_TEXT.languages.helper}</span>
      </div>
    </div>
  );
};
