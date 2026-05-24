import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';

import { Card } from '@app/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { cn } from '@app/lib/utils';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import RunTestSuiteButton from './RunTestSuiteButton';

import type { SetupReadiness } from './setupReadiness';

interface RunOptionsSectionProps {
  description?: string;
  delay?: number;
  maxConcurrency?: number;
  onChange: (options: { description?: string; delay?: number; maxConcurrency?: number }) => void;
  readiness: SetupReadiness;
}

const getDelayError = (value: string): string | undefined => {
  if (value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return 'Enter a whole number of milliseconds, 0 or greater.';
  }

  return undefined;
};

const getMaxConcurrencyError = (value: string): string | undefined => {
  if (value === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 'Enter a whole number of concurrent requests, 1 or greater.';
  }

  return undefined;
};

function useNumericPropToDraftSync(
  prop: number | undefined,
  setDraft: Dispatch<SetStateAction<string>>,
) {
  const lastPropRef = useRef(prop);
  useEffect(() => {
    if (prop === lastPropRef.current) {
      return;
    }
    lastPropRef.current = prop;
    setDraft((current) => {
      const parsed = current === '' ? undefined : Number(current);
      return parsed === prop ? current : prop?.toString() || '';
    });
  }, [prop, setDraft]);
}

export function RunOptionsSection({
  description,
  delay,
  maxConcurrency,
  onChange,
  readiness,
}: RunOptionsSectionProps) {
  const [showOptionalSettings, setShowOptionalSettings] = useState(
    Boolean(description || delay || maxConcurrency),
  );
  const [delayDraft, setDelayDraft] = useState(delay?.toString() || '');
  const [maxConcurrencyDraft, setMaxConcurrencyDraft] = useState(maxConcurrency?.toString() || '');
  const delayError = getDelayError(delayDraft);
  const maxConcurrencyError = getMaxConcurrencyError(maxConcurrencyDraft);
  const canSetDelay = maxConcurrencyDraft === '' || Number(maxConcurrencyDraft) === 1;
  const canSetMaxConcurrency = delayDraft === '' || Number(delayDraft) === 0;
  const settingsError = delayError || maxConcurrencyError;

  const handleOptionalSettingsOpenChange = (open: boolean) => {
    if (!open && settingsError) {
      return;
    }

    setShowOptionalSettings(open);
  };

  // Preserve invalid in-progress drafts so a parent re-render mid-edit does not wipe user input.
  useNumericPropToDraftSync(delay, setDelayDraft);
  useNumericPropToDraftSync(maxConcurrency, setMaxConcurrencyDraft);

  const handleDelayChange = (value: string) => {
    setDelayDraft(value);
    if (getDelayError(value)) {
      return;
    }

    const parsed = value === '' ? undefined : Number(value);
    onChange({
      description,
      delay: parsed,
      maxConcurrency: parsed && parsed > 0 ? 1 : maxConcurrency,
    });
  };

  const handleMaxConcurrencyChange = (value: string) => {
    setMaxConcurrencyDraft(value);
    if (getMaxConcurrencyError(value)) {
      return;
    }

    const parsed = value === '' ? undefined : Number(value);
    onChange({
      description,
      delay: parsed && parsed > 1 ? 0 : delay,
      maxConcurrency: parsed,
    });
  };

  return (
    <div className="space-y-4">
      <Collapsible open={showOptionalSettings} onOpenChange={handleOptionalSettingsOpenChange}>
        <Card className="bg-muted/30 border-dashed">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 p-4 text-left">
            <div>
              <h3 className="text-base font-medium">Optional run settings</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Name this evaluation or control request rate limits.
              </p>
            </div>
            <ChevronDown
              className={cn(
                'size-5 shrink-0 text-muted-foreground transition-transform',
                showOptionalSettings && 'rotate-180',
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 border-t border-border px-4 pb-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="description">Evaluation name or description</Label>
              <Input
                id="description"
                placeholder="e.g., GPT-4 vs Claude for support prompts"
                value={description || ''}
                onChange={(e) => onChange({ description: e.target.value, delay, maxConcurrency })}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Helps you find this evaluation later.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="delay" className={canSetDelay ? '' : 'text-muted-foreground'}>
                  Delay between calls (ms)
                </Label>
                <Input
                  id="delay"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="0"
                  value={delayDraft}
                  onChange={(e) => handleDelayChange(e.target.value)}
                  disabled={!canSetDelay}
                  aria-invalid={Boolean(delayError)}
                  aria-describedby={delayError ? 'delay-error' : 'delay-help'}
                />
                {delayError ? (
                  <HelperText id="delay-error" error role="alert">
                    {delayError}
                  </HelperText>
                ) : (
                  <HelperText id="delay-help">
                    {canSetDelay
                      ? 'Add a delay to reduce rate-limit errors.'
                      : 'Set maximum concurrent requests to 1 before adding a delay.'}
                  </HelperText>
                )}
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="maxConcurrency"
                  className={canSetMaxConcurrency ? '' : 'text-muted-foreground'}
                >
                  Maximum concurrent requests
                </Label>
                <Input
                  id="maxConcurrency"
                  type="number"
                  min="1"
                  step="1"
                  placeholder="4"
                  value={maxConcurrencyDraft}
                  onChange={(e) => handleMaxConcurrencyChange(e.target.value)}
                  disabled={!canSetMaxConcurrency}
                  aria-invalid={Boolean(maxConcurrencyError)}
                  aria-describedby={
                    maxConcurrencyError ? 'max-concurrency-error' : 'max-concurrency-help'
                  }
                />
                {maxConcurrencyError ? (
                  <HelperText id="max-concurrency-error" error role="alert">
                    {maxConcurrencyError}
                  </HelperText>
                ) : (
                  <HelperText id="max-concurrency-help">
                    {canSetMaxConcurrency
                      ? 'Controls how many requests run at once.'
                      : 'Set delay to 0 before increasing concurrency.'}
                  </HelperText>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              These settings apply to every provider. Delay and concurrency cannot be used together.
            </p>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Run Evaluation Section */}
      <Card className="border-primary/20 bg-primary/5 p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Review and run</h3>
            <p className="text-sm text-muted-foreground">
              By default, each test case sends every prompt to every provider. YAML routing can
              narrow those base requests; some assertion types can make additional model calls and
              increase cost.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-2">
            {[
              ['Providers', readiness.providerCount],
              ['Prompts', readiness.promptCount],
              ['Test cases', readiness.testCount],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-border bg-background p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-xl font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          {readiness.plannedBaseRequestCount !== undefined && readiness.isReadyToRun && (
            <p className="text-sm text-muted-foreground">
              This configuration starts with {readiness.plannedBaseRequestCount} base request
              {readiness.plannedBaseRequestCount === 1 ? '' : 's'} before any additional
              model-graded checks.
            </p>
          )}

          {readiness.issues.length > 0 ? (
            <div
              role="alert"
              aria-atomic="true"
              className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            >
              <p className="text-sm font-medium">Complete these items before running:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {readiness.issues.map((issue) => (
                  <li key={issue.id}>{issue.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
            >
              <CheckCircle2 className="size-4 shrink-0" />
              Required setup is complete. Start the evaluation when you are ready.
            </div>
          )}

          <RunTestSuiteButton
            disabledReason={
              settingsError ? 'Fix invalid optional run settings before starting.' : undefined
            }
          />
        </div>
      </Card>
    </div>
  );
}
