import { useCallback, useMemo, useRef, useState } from 'react';

import { BaseNumberInput } from '@app/components/form/input/BaseNumberInput';
import { Badge } from '@app/components/ui/badge';
import { Label } from '@app/components/ui/label';
import { Switch } from '@app/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { COMMON_LANGUAGE_NAMES, normalizeLanguage } from '@app/constants/languages';
import { REDTEAM_DEFAULTS } from '@promptfoo/redteam/constants';
import { X } from 'lucide-react';
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
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help underline decoration-dotted">{label}</span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
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
          endAdornment: <span className="pl-2 text-xs text-muted-foreground">ms</span>,
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
          endAdornment: <span className="pl-2 text-xs text-muted-foreground">requests</span>,
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

  // Normalize language to array
  const languageArray = useMemo<string[]>(() => {
    if (!language) {
      return [];
    }
    return Array.isArray(language) ? language : [language];
  }, [language]);

  // Language input state
  const [languageInput, setLanguageInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions based on input
  const filteredSuggestions = useMemo(() => {
    if (!languageInput.trim()) {
      return COMMON_LANGUAGE_NAMES.filter((lang) => !languageArray.includes(lang)).slice(0, 8);
    }
    const search = languageInput.toLowerCase();
    return COMMON_LANGUAGE_NAMES.filter(
      (lang) => lang.toLowerCase().includes(search) && !languageArray.includes(lang),
    ).slice(0, 8);
  }, [languageInput, languageArray]);

  // Add a language
  const addLanguage = useCallback(
    (lang: string) => {
      const normalized = normalizeLanguage(lang);
      if (normalized && !languageArray.includes(normalized)) {
        const newLanguages = [...languageArray, normalized];
        updateConfig('language', newLanguages.length > 0 ? newLanguages : undefined);
      }
      setLanguageInput('');
      setShowSuggestions(false);
    },
    [languageArray, updateConfig],
  );

  // Remove a language
  const removeLanguage = useCallback(
    (lang: string) => {
      const newLanguages = languageArray.filter((l) => l !== lang);
      updateConfig('language', newLanguages.length > 0 ? newLanguages : undefined);
    },
    [languageArray, updateConfig],
  );

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && languageInput.trim()) {
        e.preventDefault();
        addLanguage(languageInput.trim());
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    },
    [languageInput, addLanguage],
  );

  return (
    <div className="flex flex-col gap-6">
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
        <div className="relative">
          <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background p-2 focus-within:ring-2 focus-within:ring-ring">
            {languageArray.map((lang) => (
              <Badge key={lang} variant="secondary" className="gap-1">
                {lang}
                <button
                  type="button"
                  onClick={() => removeLanguage(lang)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <input
              ref={inputRef}
              type="text"
              value={languageInput}
              onChange={(e) => setLanguageInput(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Delay to allow click on suggestions
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              onKeyDown={handleKeyDown}
              placeholder={languageArray.length === 0 ? RUNOPTIONS_TEXT.languages.placeholder : ''}
              className="min-w-[150px] flex-1 border-none bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>
          {showSuggestions && filteredSuggestions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
              {filteredSuggestions.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addLanguage(lang)}
                  className="w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  {lang}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-sm text-muted-foreground">{RUNOPTIONS_TEXT.languages.helper}</span>
      </div>
    </div>
  );
};
