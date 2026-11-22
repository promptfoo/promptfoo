import { useEffect, useRef } from 'react';

import { Button } from '@app/components/ui/button';
import { Checkbox } from '@app/components/ui/checkbox';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import { ArrowRight, ArrowUp, Loader2, LockKeyhole } from 'lucide-react';
import { type Field, isField, type SetupDraft, useSetupAgent } from '../hooks/useSetupAgent';
import { riskName } from '../utils/plugins';
import { targetDestination } from '../utils/targetDestination';
import { getEstimatedProbes } from './strategies/utils';

import type { Config } from '../types';

const DEMO_DESCRIPTION =
  "Test as a customer shopping at an electronics store. The support bot can look up my orders and update my tickets. It must never show or change another customer's records.";
const OPENING = 'What does your app do, and what should it never do?';
const EXAMPLES: Partial<Record<Field, string[]>> = {
  body: ['{"message":"{{prompt}}"}', '{"prompt":"{{prompt}}"}'],
  responsePath: ['response', 'Plain text'],
  authEnv: ['No auth'],
};
const PLACEHOLDERS: Record<SetupDraft['step'], string> = {
  scope: 'Describe the data it can see or actions it can take…',
  url: 'http://localhost:3000/chat or ollama:chat:llama3',
  body: '{"message":"{{prompt}}"}',
  responsePath: 'result.answer',
  authEnv: 'MY_APP_TOKEN or No auth',
  ready: 'Ask to change the tests or test count…',
};

interface SetupProps {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft) => void;
  fresh: boolean;
  onApply: (config: Config, manual?: boolean) => void;
  onManual: () => void;
  onLoad: () => void;
}

function ConnectionSummary({
  config,
  draft,
  edit,
}: {
  config: Config;
  draft: SetupDraft;
  edit: (field: Field) => void;
}) {
  const { connection, demo } = draft;
  const target = config.target;
  const rows: [Field, string, string][] = [
    ['url', 'Target', connection?.url || targetDestination(target)],
  ];
  if (connection?.body) {
    rows.push(
      ['body', 'Request', 'POST ' + JSON.stringify(connection.body)],
      ['responsePath', 'Read reply', connection.responsePath || 'Plain text'],
      [
        'authEnv',
        'Authorization',
        connection.authEnv ? 'Bearer token from ' + connection.authEnv : 'None',
      ],
    );
  }
  return (
    <div className="rounded-md bg-muted/40 px-3 py-2">
      {rows.map(([field, label, value]) => (
        <div key={field} className="flex items-baseline justify-between gap-2 py-0.5">
          <p className="min-w-0 break-words">
            <span className="text-muted-foreground">{label} · </span>
            <span className="font-mono text-xs">{value}</span>
          </p>
          <button
            type="button"
            className="shrink-0 text-xs text-primary underline-offset-4 hover:underline"
            aria-label={'Change ' + label.toLowerCase()}
            onClick={() => edit(field)}
          >
            Change
          </button>
        </div>
      ))}
      {connection?.model && (
        <p className="mt-1 text-xs text-muted-foreground">
          This tests the model directly. To include your app’s instructions and tools, use its HTTP
          endpoint.{' '}
          {connection.model.startsWith('ollama:')
            ? 'Start Ollama with this model before running.'
            : 'Your model provider’s credentials must be available where Promptfoo runs.'}
        </p>
      )}
      {demo && <p className="text-xs text-muted-foreground">Promptfoo demo app</p>}
    </div>
  );
}

const FACT_LABELS = {
  redteamUser: 'Test as',
  accessToData: 'Can read',
  forbiddenData: 'Must keep private',
  accessToActions: 'Can do',
  forbiddenActions: 'Must not do',
} as const;

function PlanSummary({
  edit,
  draft,
  setDraft,
  config,
  plan,
  disabled,
}: Pick<SetupProps, 'draft' | 'setDraft'> & {
  edit: (field: Field) => void;
  config: Config;
  plan: NonNullable<SetupDraft['plan']>;
  disabled: boolean;
}) {
  const excluded = draft.excluded ?? [];
  const facts = Object.entries(FACT_LABELS).flatMap(([field, label]) => {
    const value = config.applicationDefinition[field as keyof typeof FACT_LABELS];
    return value ? [[label, value]] : [];
  });
  return (
    <fieldset
      disabled={disabled}
      className="mt-3 min-w-0 space-y-3 rounded-lg border border-border bg-card p-4 text-sm"
    >
      <ConnectionSummary config={config} draft={draft} edit={edit} />
      <p className="break-words">{plan.purpose}</p>
      {facts.length > 0 && (
        <details>
          <summary className="cursor-pointer text-muted-foreground">App details</summary>
          <dl className="mt-2 space-y-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="font-medium">{label}</dt>
                <dd className="break-words text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      <ul className="space-y-3">
        {plan.plugins.map(({ id, reason }) => (
          <li key={id} className="flex items-start gap-2">
            <Checkbox
              id={'risk-' + id}
              className="mt-0.5"
              checked={config.plugins.includes(id)}
              aria-label={riskName(id)}
              aria-describedby={'reason-' + id}
              onCheckedChange={() =>
                setDraft({
                  ...draft,
                  excluded: excluded.includes(id)
                    ? excluded.filter((value) => value !== id)
                    : [...excluded, id],
                })
              }
            />
            <label htmlFor={'risk-' + id} className="min-w-0">
              <span className="block font-medium">{riskName(id)}</span>
              <span id={'reason-' + id} className="block break-words text-muted-foreground">
                {reason}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {plan.note && <p className="break-words">{plan.note}</p>}
    </fieldset>
  );
}

function Composer({
  draft,
  setDraft,
  agent,
}: Pick<SetupProps, 'draft' | 'setDraft'> & { agent: ReturnType<typeof useSetupAgent> }) {
  const local = isField(draft.step);
  const { pending, error, send } = agent;
  const reply = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!pending && draft.messages.length && draft.step !== 'ready') {
      reply.current?.focus({ preventScroll: true });
    }
  }, [draft.messages.length, draft.step, pending]);
  return (
    <form
      className="shrink-0 border-t border-border bg-background py-3"
      onSubmit={(event) => {
        event.preventDefault();
        send(draft.input.trim());
      }}
    >
      {error && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          ref={reply}
          aria-label={local ? 'Connection reply' : 'Message the setup agent'}
          aria-describedby="setup-privacy"
          rows={2}
          className="min-h-14 resize-none"
          value={draft.input}
          onChange={(event) => setDraft({ ...draft, input: event.target.value })}
          readOnly={pending}
          placeholder={PLACEHOLDERS[draft.step]}
          maxLength={local ? 16000 : 2000}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button
          type="submit"
          disabled={pending || !draft.input.trim()}
          className="shrink-0"
          aria-label="Send reply"
        >
          <span className="hidden sm:inline">Send</span>
          <ArrowUp aria-hidden="true" />
        </Button>
      </div>
      <p id="setup-privacy" className="mt-2 text-xs text-muted-foreground">
        {local ? (
          <>
            <LockKeyhole className="mr-1 inline size-3" aria-hidden="true" />
            Connection replies stay in this browser during setup. Never paste secrets.
          </>
        ) : (
          'App and test messages go to Promptfoo Cloud. Leave out secrets and personal data.'
        )}
      </p>
    </form>
  );
}

function ChatMessage({ message }: { message: SetupDraft['messages'][number] }) {
  return message.role === 'user' ? (
    <p className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-xl bg-muted px-3 py-2 text-sm">
      <span className="sr-only">You. </span>
      {message.content}
    </p>
  ) : (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      <span className="sr-only">Setup agent. </span>
      {message.content}
    </p>
  );
}

function LocalActions({
  step,
  draft,
  agent,
  fresh,
  onApply,
}: Pick<SetupProps, 'draft' | 'fresh' | 'onApply'> & {
  step: Field;
  agent: ReturnType<typeof useSetupAgent>;
}) {
  const { plan } = draft;
  const { pending, replacing, proposed } = agent;
  const idle = !pending && !draft.input.trim();
  return (
    <div className="space-y-2">
      {((step === 'url' && !draft.deferred) || agent.connected) && (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={!idle}
            onClick={() =>
              agent.connected ? agent.resume() : agent.send('I don’t have an endpoint yet')
            }
          >
            {agent.connected ? 'Keep current connection' : 'I don’t have an endpoint yet'}
          </Button>
        </div>
      )}
      {EXAMPLES[step] && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES[step].map((example) => (
            <Button
              key={example}
              size="sm"
              variant="outline"
              disabled={!idle}
              onClick={() => agent.send(example)}
            >
              {example}
            </Button>
          ))}
        </div>
      )}
      {plan && (
        <Button
          size="sm"
          variant="link"
          className="px-0"
          disabled={pending}
          onClick={() => agent.edit('scope')}
        >
          {agent.canMoveSuggestion ? 'Edit reply for Promptfoo Cloud' : 'Adjust tests'}
        </Button>
      )}
      {replacing && !fresh && (
        <p className="text-xs text-muted-foreground">
          Continuing manually will use the new target and reset the previous app settings.
        </p>
      )}
      {!fresh && proposed && !!proposed.plugins.length && (
        <Button
          size="sm"
          variant="link"
          className="ml-4 px-0"
          disabled={pending}
          onClick={() => onApply(proposed, true)}
        >
          Use tests in manual setup
        </Button>
      )}
    </div>
  );
}

function ReviewAction({
  agent,
  draft,
  fresh,
  onApply,
}: Pick<SetupProps, 'draft' | 'fresh' | 'onApply'> & { agent: ReturnType<typeof useSetupAgent> }) {
  const { proposed, replacing, pending, ready } = agent;
  const idle = !pending && !draft.input.trim();
  const deferred = draft.deferred && draft.step === 'url';
  const reviewButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ready) {
      reviewButton.current?.focus({ preventScroll: true });
    }
  }, [ready]);
  if (!proposed || (!ready && !deferred)) {
    return null;
  }
  return (
    <div className="shrink-0 border-t border-border py-2">
      {!fresh && (replacing || !draft.approved) && (
        <p className="mb-2 text-xs text-muted-foreground">
          {replacing
            ? 'Reviewing replaces your target and starts fresh app settings.'
            : 'Reviewing replaces your current test settings.'}{' '}
          Saved configurations stay unchanged.
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm">
          {proposed.plugins.length ? (
            <>
              <strong>~{getEstimatedProbes(proposed).toLocaleString()} requests</strong>
              <span className="block text-xs text-muted-foreground">
                {proposed.numTests} direct tests per risk
              </span>
            </>
          ) : (
            'Select at least one risk.'
          )}
        </p>
        <Button
          ref={reviewButton}
          disabled={!idle || !proposed.plugins.length}
          onClick={() => onApply(proposed)}
        >
          {agent.ready ? 'Review setup' : 'Review draft'} <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export default function Setup({ draft, setDraft, fresh, onApply, onManual, onLoad }: SetupProps) {
  const { messages, plan, step } = draft;
  const agent = useSetupAgent(draft, setDraft);
  const { pending, disabled, proposed, hasTarget } = agent;
  const ready = agent.ready && plan && proposed;
  const local = isField(step);
  const lastTurn = useRef<HTMLDivElement>(null);

  const manualLabel = fresh ? 'Set up manually' : 'Return to configuration';
  const idle = !pending && !draft.input.trim();
  const started = messages.length > 0;
  const opening =
    hasTarget && !started
      ? 'I’ll keep your current target unless you change it. ' + OPENING
      : OPENING;

  useEffect(() => {
    if (messages.length) {
      lastTurn.current?.scrollIntoView({ block: 'start' });
    }
  }, [messages.length]);

  return (
    <section className="ph-no-capture mx-auto flex h-full w-full max-w-3xl flex-col px-4 sm:px-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-border py-2">
        <h1 className="text-base font-semibold">Red team setup</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (fresh && (local || ready) && proposed?.plugins.length) {
                onApply(proposed, true);
              } else {
                onManual();
              }
            }}
          >
            {manualLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={onLoad}>
            Load or import config
          </Button>
        </div>
      </header>
      {disabled ? (
        <div className="space-y-2 py-8">
          <h2 className="text-2xl font-semibold">Agent setup is turned off</h2>
          <p className="text-muted-foreground">
            Remote generation is disabled. You can configure tests manually or import a
            configuration.
          </p>
        </div>
      ) : (
        <>
          <div
            className={cn(
              'min-h-0 space-y-4 overflow-y-auto py-6',
              started ? 'flex-1' : 'sm:pt-12',
            )}
          >
            <div className="space-y-2">
              <p className="text-sm font-medium text-primary">Setup agent</p>
              <p className={started ? 'text-sm' : 'text-2xl font-semibold tracking-tight'}>
                {opening}
              </p>
              {!started && (
                <p className="text-sm text-muted-foreground">
                  I’ll help you choose tests and connect your app here. No model API key needed for
                  setup. Nothing runs until you say so.
                </p>
              )}
            </div>
            {!started && fresh && (!draft.input || draft.demo) && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  setDraft({
                    ...draft,
                    demo: !draft.demo,
                    input: draft.demo ? '' : DEMO_DESCRIPTION,
                  });
                  agent.clearError();
                }}
              >
                {draft.demo ? 'Use my own app' : 'Try the demo app'}
              </Button>
            )}
            {draft.demo && !started && (
              <p className="text-sm text-muted-foreground">
                Using Promptfoo’s demo app. Send the description below to start.
              </p>
            )}
            <div role="log" aria-label="Setup conversation" className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} ref={index === messages.length - 1 ? lastTurn : undefined}>
                  <ChatMessage message={message} />
                </div>
              ))}
            </div>
            {draft.previousPlan && (
              <Button size="sm" variant="outline" disabled={!idle} onClick={agent.restorePlan}>
                Keep previous tests
              </Button>
            )}
            {local && (
              <LocalActions
                step={step}
                draft={draft}
                agent={agent}
                fresh={fresh}
                onApply={onApply}
              />
            )}
            {step === 'scope' && !!plan?.plugins.length && (
              <Button variant="outline" size="sm" onClick={agent.resume} disabled={!idle}>
                {draft.interrupted ? 'Back to connection' : 'Keep previous tests'}
              </Button>
            )}
            {ready && (
              <PlanSummary
                edit={agent.edit}
                draft={draft}
                setDraft={setDraft}
                config={proposed}
                plan={plan}
                disabled={!idle}
              />
            )}
            {pending && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Thinking…
              </p>
            )}
          </div>
          <ReviewAction agent={agent} draft={draft} fresh={fresh} onApply={onApply} />
          <Composer draft={draft} setDraft={setDraft} agent={agent} />
        </>
      )}
    </section>
  );
}
