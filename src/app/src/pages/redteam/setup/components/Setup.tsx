import { useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import { Label } from '@app/components/ui/label';
import { Textarea } from '@app/components/ui/textarea';
import { callApi } from '@app/utils/api';
import { type RedteamSetupPlan, RedteamSetupPlanSchema } from '@promptfoo/types/api/redteamSetup';
import isEqual from 'fast-deep-equal';
import { ArrowRight, Loader2 } from 'lucide-react';
import { EXAMPLE_CONFIG, useRedTeamConfig } from '../hooks/useRedTeamConfig';
import { riskName } from '../utils/plugins';
import { applicationDefinitionToPurpose } from '../utils/purposeParser';
import { getEstimatedProbes } from './strategies/utils';

import type { Config } from '../types';

const API_PATH = '/redteam/setup-plan';
const DEMO_DESCRIPTION =
  "A customer support agent for an electronics store. It can look up orders and update support tickets. It must never show another customer's records or change their tickets.";
const UNAVAILABLE = 'Could not reach the setup agent. Try again or set up manually.';

export interface SetupDraft {
  description: string;
  refinement: string;
  demo: boolean;
  plan?: RedteamSetupPlan;
  excluded?: string[];
}

interface SetupProps {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft) => void;
  fresh: boolean;
  onApply: (config: Config, demo: boolean) => void;
  onManual: () => void;
  onLoad: () => void;
}

// Only risk IDs and plain purpose text from the validated plan enter the config.
function buildConfig(config: Config, plan: RedteamSetupPlan, demo: boolean): Config {
  const base = demo ? EXAMPLE_CONFIG : config;
  const applicationDefinition = { ...base.applicationDefinition, purpose: plan.purpose };
  return {
    ...base,
    applicationDefinition,
    purpose: applicationDefinitionToPurpose(applicationDefinition),
    plugins: plan.plugins.map(({ id }) => id),
    strategies: ['basic'],
    numTests: 3,
  };
}

function PlanSummary({
  plan,
  config,
  toggleRisk,
  pending,
}: {
  plan: RedteamSetupPlan;
  config: Config;
  toggleRisk: (id: string) => void;
  pending: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <ul className="divide-y divide-border">
        {plan.plugins.map(({ id, reason }) => (
          <li key={id} className="flex items-start gap-3 px-4 py-3">
            {plan.plugins.length > 1 && (
              <Checkbox
                id={`risk-${id}`}
                className="mt-0.5"
                checked={config.plugins.includes(id)}
                onCheckedChange={() => toggleRisk(id)}
                disabled={pending}
                aria-label={riskName(id)}
                aria-describedby={`reason-${id}`}
              />
            )}
            <label
              htmlFor={plan.plugins.length > 1 ? `risk-${id}` : undefined}
              className="min-w-0 space-y-1"
            >
              <span className="block text-sm font-medium">{riskName(id)}</span>
              <span id={`reason-${id}`} className="block text-sm break-words text-muted-foreground">
                {reason}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {plan.note && (
        <p className="border-t border-border px-4 py-3 text-sm break-words">
          <strong>Coverage limits</strong> {plan.note}
        </p>
      )}
      <p aria-live="polite" className="border-t border-border bg-muted/30 px-4 py-3 text-sm">
        {config.plugins.length ? (
          <>
            About <strong>{getEstimatedProbes(config).toLocaleString()} requests</strong> to the
            target when you run. Adjust the test count in Review.
          </>
        ) : (
          'Select at least one risk to use this plan.'
        )}
      </p>
    </div>
  );
}

function useAgent(
  draft: SetupDraft,
  setDraft: SetupProps['setDraft'],
  selected?: RedteamSetupPlan,
) {
  const { description, refinement, plan } = draft;
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    callApi(API_PATH, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setDisabled(data.enabled === false))
      .catch(() => {}); // A temporary status failure should not block a draft.
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || !(plan ? refinement : description).trim()) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    try {
      const response = await callApi(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          ...(plan && {
            previous: selected?.plugins.length ? selected : plan,
            refinement: refinement.trim(),
          }),
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) {
        return;
      }
      if (!response.ok) {
        setError(result.error || UNAVAILABLE);
        return;
      }
      setDraft({
        ...draft,
        plan: RedteamSetupPlanSchema.parse(result),
        refinement: '',
        excluded: [],
      });
    } catch {
      setError(UNAVAILABLE);
    } finally {
      setPending(false);
    }
  }

  return { pending, error, disabled, submit, clearError: () => setError('') };
}

function ApplyPlan({
  fresh,
  demo,
  disabled,
  onApply,
}: {
  fresh: boolean;
  demo: boolean;
  disabled: boolean;
  onApply: () => void;
}) {
  const label = demo
    ? 'Review demo setup'
    : fresh
      ? 'Use plan & connect app'
      : 'Use plan with current target';
  const hint = fresh
    ? demo
      ? 'Review before running against the Promptfoo demo app.'
      : 'Next, connect your app. It may require its own credentials.'
    : 'Using this plan replaces the current purpose, plugins, strategies and test count. Your target stays the same.';
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Button type="button" disabled={disabled} onClick={onApply}>
        {label} <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  );
}

function AgentForm({
  draft,
  setDraft,
  agent,
  fresh,
}: Pick<SetupProps, 'draft' | 'setDraft' | 'fresh'> & { agent: ReturnType<typeof useAgent> }) {
  const { plan, refinement, description, demo } = draft;
  const { pending, submit, error } = agent;
  const input = useRef<HTMLTextAreaElement>(null);
  const status = pending
    ? 'Drafting your test plan…'
    : demo && !plan && fresh
      ? 'Using the Promptfoo demo app. You can edit the description before sending.'
      : 'Drafting won’t contact your app or run any tests.';
  const value = plan ? refinement : description;
  return (
    <form onSubmit={submit} className="my-5 space-y-3">
      <Label htmlFor="setup-input" className="block break-words leading-normal">
        {plan ? (
          <>
            {plan.question ||
              (plan.plugins.length ? 'What would you change?' : 'What else should we test?')}{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </>
        ) : (
          'What does your app do, and what should it never do?'
        )}
      </Label>
      <Textarea
        id="setup-input"
        ref={input}
        rows={plan ? 2 : 4}
        maxLength={plan ? 1000 : 2000}
        disabled={pending}
        placeholder={
          plan
            ? 'For example, what data can the app see or what actions can it take?'
            : 'Our support bot can look up orders. It should never reveal another customer’s address.'
        }
        value={value}
        onChange={(event) =>
          setDraft({ ...draft, [plan ? 'refinement' : 'description']: event.target.value })
        }
        aria-describedby="setup-privacy"
      />
      <p id="setup-privacy" className="text-sm text-muted-foreground">
        {plan
          ? 'Refining sends your answers and this plan to Promptfoo Cloud.'
          : 'Drafting sends this description to Promptfoo Cloud.'}{' '}
        Leave out secrets and personal data.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant={plan ? 'outline' : 'default'}
          disabled={pending || !value.trim()}
        >
          {pending && <Loader2 aria-hidden="true" className="animate-spin" />}
          {plan ? 'Refine plan' : 'Draft test plan'}
          {!plan && !pending && <ArrowRight aria-hidden="true" />}
        </Button>
        {!plan && fresh && (!description || demo) && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setDraft({ ...draft, description: demo ? '' : DEMO_DESCRIPTION, demo: !demo });
              input.current?.focus();
            }}
          >
            {demo ? 'Use my own app' : 'Try the demo app'}
          </Button>
        )}
        {plan && refinement.trim() && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft({ ...draft, refinement: '' });
              agent.clearError();
              input.current?.focus();
            }}
          >
            Discard changes
          </Button>
        )}
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </form>
  );
}

export default function Setup({ draft, setDraft, fresh, onApply, onManual, onLoad }: SetupProps) {
  const { plan } = draft;
  const { config } = useRedTeamConfig();
  const demo = draft.demo && (fresh || isEqual(config.target, EXAMPLE_CONFIG.target));
  const excluded = draft.excluded ?? [];
  const selected = plan && {
    ...plan,
    plugins: plan.plugins.filter(({ id }) => !excluded.includes(id)),
  };
  const unsupported = plan?.plugins.length === 0;
  const proposed = selected && !unsupported && buildConfig(config, selected, draft.demo && fresh);
  const agent = useAgent(draft, setDraft, selected);
  const { disabled, pending } = agent;
  const title = useRef<HTMLHeadingElement>(null);
  const manualLabel = fresh ? 'Set up manually' : 'Return to configuration';

  // biome-ignore lint/correctness/useExhaustiveDependencies: Focus each new screen, including a revised plan.
  useEffect(() => {
    title.current?.focus();
  }, [plan, disabled]);

  return (
    <section className="ph-no-capture mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="mb-2 text-sm font-medium text-primary">Red team setup</p>
      <h1
        ref={title}
        tabIndex={-1}
        className="text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
      >
        {disabled
          ? 'Agent setup is turned off'
          : unsupported
            ? 'No matching starter tests'
            : plan
              ? 'Your test plan'
              : 'What should we test?'}
      </h1>
      {disabled ? (
        <p className="mt-2 text-muted-foreground">
          Remote generation is disabled. You can configure tests manually or import a configuration.
        </p>
      ) : (
        <>
          <p className="mb-6 mt-2 break-words text-muted-foreground">
            {unsupported
              ? plan.note
              : (plan?.purpose ??
                'Describe your app. The setup agent will suggest what to test and why. No model API key needed to draft a plan.')}
          </p>
          {unsupported && <Button onClick={onManual}>{manualLabel}</Button>}
          {plan && proposed && (
            <>
              <PlanSummary
                plan={plan}
                config={proposed}
                pending={pending}
                toggleRisk={(id) =>
                  setDraft({
                    ...draft,
                    excluded: excluded.includes(id)
                      ? excluded.filter((value) => value !== id)
                      : [...excluded, id],
                  })
                }
              />
              <ApplyPlan
                fresh={fresh}
                demo={demo}
                disabled={pending || !proposed.plugins.length || Boolean(draft.refinement.trim())}
                onApply={() => onApply(proposed, demo)}
              />
            </>
          )}
          <AgentForm draft={draft} setDraft={setDraft} fresh={fresh} agent={agent} />
        </>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 border-t border-border pt-3">
        {(!unsupported || disabled) && (
          <Button
            variant={disabled ? 'default' : 'link'}
            className={disabled ? '' : 'px-0'}
            onClick={onManual}
          >
            {manualLabel}
          </Button>
        )}
        {!plan && (
          <Button variant="link" className="px-0" onClick={onLoad}>
            Load or import config
          </Button>
        )}
        {plan && (
          <Button
            variant="link"
            className="px-0"
            disabled={pending}
            onClick={() => {
              setDraft({ ...draft, plan: undefined, refinement: '' });
              agent.clearError();
            }}
          >
            Edit description
          </Button>
        )}
      </div>
    </section>
  );
}
