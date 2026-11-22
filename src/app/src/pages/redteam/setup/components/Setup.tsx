import { useEffect, useRef } from 'react';

import { Button } from '@app/components/ui/button';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import {
  ArrowRight,
  ArrowUp,
  BotMessageSquare,
  CircleAlert,
  CircleCheck,
  Cloud,
  FlaskConical,
  FolderOpen,
  Loader2,
  LockKeyhole,
  PlugZap,
} from 'lucide-react';
import { useConnectionTest } from '../hooks/useConnectionTest';
import { type Field, isField, type SetupDraft, useSetupAgent } from '../hooks/useSetupAgent';
import SetupPlan, { ConnectionSummary } from './SetupPlan';
import { getEstimatedProbes } from './strategies/utils';

import type { Config } from '../types';

const DEMO_DESCRIPTION =
  "Test as a customer shopping at an electronics store. The support bot can look up my orders and update my tickets. It must never show or change another customer's records.";
const OPENING = 'Describe your app and what could go wrong.';
const EXAMPLES: Partial<Record<Field, string[]>> = {
  body: ['message', 'prompt'],
  responsePath: ['response', 'Plain text'],
  authHeader: ['X-API-Key', 'Authorization: Bearer'],
  authEnv: ['No auth'],
  modelName: ['Skip model name'],
};
const PLACEHOLDERS: Record<SetupDraft['step'], string> = {
  scope: 'Message the setup agent…',
  url: 'I POST to https://example.com/chat with a message field. Read result.text. No auth.',
  body: 'The prompt goes in the message field…',
  responsePath: 'The answer is in result.text…',
  authHeader: 'Header name, e.g. X-API-Key',
  authEnv: 'Environment variable name, e.g. APP_API_KEY',
  modelName: 'Model name your API expects…',
  ready: 'Ask for changes…',
};

interface SetupProps {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft) => void;
  fresh: boolean;
  onApply: (config: Config, manual?: boolean) => void;
  onManual: () => void;
  onLoad: () => void;
}

type Agent = ReturnType<typeof useSetupAgent>;
type ConnectionTest = ReturnType<typeof useConnectionTest>;

function Composer({
  draft,
  setDraft,
  agent,
  check,
  started,
}: Pick<SetupProps, 'draft' | 'setDraft'> & {
  agent: Agent;
  check: ConnectionTest;
  started: boolean;
}) {
  const { local, error, pending } = agent;
  const busy = pending || check.testing;
  const reply = useRef<HTMLTextAreaElement>(null);
  const testFailed = draft.messages[draft.messages.length - 1]?.test === 'error';
  useEffect(() => {
    if (busy || check.paths.length) {
      return;
    }
    if (error || testFailed || (draft.step !== 'ready' && (draft.messages.length || draft.demo))) {
      reply.current?.focus({ preventScroll: true });
    }
  }, [draft.messages.length, draft.step, draft.demo, busy, error, testFailed, check.paths.length]);
  const PrivacyIcon = local ? LockKeyhole : Cloud;
  const placeholder =
    draft.step === 'scope' && agent.connected && !draft.plan
      ? 'Describe what you want to test…'
      : PLACEHOLDERS[draft.step];
  return (
    <form
      className="shrink-0"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && draft.input.trim()) {
          check.send(draft.input.trim());
        }
      }}
    >
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 sm:p-3">
        <Textarea
          ref={reply}
          aria-label={local ? 'Connection reply' : 'Message the setup agent'}
          aria-describedby="setup-privacy"
          rows={started ? 1 : 2}
          className={cn(
            'field-sizing-content min-w-0 flex-1 resize-none! border-0! bg-transparent! px-2! py-1.5! text-base leading-6 focus-visible:ring-0 focus-visible:ring-offset-0',
            started ? 'min-h-9 max-h-[min(20dvh,10rem)]' : 'min-h-20 max-h-[min(32dvh,16rem)]',
          )}
          value={busy ? '' : draft.input}
          onChange={(event) => setDraft({ ...draft, input: event.target.value })}
          readOnly={busy}
          placeholder={
            started
              ? placeholder
              : 'My support bot looks up orders. Customers should only see their own…'
          }
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
          size="icon"
          disabled={busy || !draft.input.trim()}
          className="shrink-0 rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
          aria-label="Send reply"
          title="Send reply (Enter)"
        >
          <ArrowUp aria-hidden="true" />
        </Button>
      </div>
      <p
        id="setup-privacy"
        className="mt-2 flex items-start gap-1.5 px-1 text-xs text-muted-foreground"
      >
        <PrivacyIcon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        {local
          ? 'Connection details stay local during setup. Never paste secrets.'
          : 'App descriptions and test plans go to Promptfoo Cloud. Leave out private data.'}
      </p>
    </form>
  );
}

function AgentAvatar() {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-blue-700 dark:text-blue-300">
      <BotMessageSquare aria-hidden="true" className="size-4" />
    </span>
  );
}

function ChatMessage({
  message,
  grouped,
}: {
  message: SetupDraft['messages'][number];
  grouped?: boolean;
}) {
  const { content, role, test } = message;
  if (role === 'user') {
    return (
      <p className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-sm bg-primary/10 px-4 py-2.5 text-[15px] leading-6 wrap-anywhere whitespace-pre-wrap sm:max-w-[80%] dark:bg-primary/15">
        <span className="sr-only">You. </span>
        {content}
      </p>
    );
  }
  const Icon = test === 'success' ? CircleCheck : CircleAlert;
  return (
    <div className={cn('flex items-start gap-3', grouped && 'pl-10')}>
      {!grouped && <AgentAvatar />}
      <p
        className={cn(
          'min-w-0 pt-0.5 text-[15px] leading-6 wrap-anywhere whitespace-pre-wrap',
          test && 'flex items-start gap-2 rounded-xl border px-3 py-2',
          test === 'success' &&
            'border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/30',
          test === 'error' &&
            'border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/30',
        )}
      >
        <span className="sr-only">Setup agent. </span>
        {test && (
          <Icon
            aria-hidden="true"
            className={cn(
              'mt-1 size-4 shrink-0',
              test === 'success'
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-amber-700 dark:text-amber-400',
            )}
          />
        )}
        {content}
      </p>
    </div>
  );
}

function LocalActions({
  step,
  draft,
  agent,
  fresh,
  check,
  onApply,
}: Pick<SetupProps, 'draft' | 'fresh' | 'onApply'> & {
  step: Field;
  agent: Agent;
  check: ConnectionTest;
}) {
  const { plan } = draft;
  const { pending, replacing, proposed } = agent;
  const busy = pending || check.testing;
  const idle = !busy && !draft.input.trim();
  const examples =
    step === 'modelName' && draft.connection?.modelName
      ? ['Remove model name']
      : step === 'authEnv' && draft.connection?.authHeader
        ? undefined
        : EXAMPLES[step];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {((step === 'url' && !draft.deferred) || agent.connected) && (
        <div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full shadow-none"
            disabled={!idle}
            onClick={() =>
              agent.connected ? agent.resume() : agent.send('I don’t have an endpoint yet')
            }
          >
            {agent.connected ? 'Keep current connection' : 'I don’t have an endpoint yet'}
          </Button>
        </div>
      )}
      {examples && !(step === 'responsePath' && check.paths.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <Button
              key={example}
              size="sm"
              variant="outline"
              className="rounded-full shadow-none"
              disabled={!idle}
              onClick={() => agent.send(example)}
            >
              {step === 'body' ? 'Use ' + example : example}
            </Button>
          ))}
        </div>
      )}
      {plan && (
        <Button
          size="sm"
          variant="link"
          className="px-2"
          disabled={busy}
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
          className="px-2"
          disabled={busy}
          onClick={() => onApply(proposed, true)}
        >
          Use tests in manual setup
        </Button>
      )}
    </div>
  );
}

function SetupActions({
  agent,
  check,
  draft,
  fresh,
  onApply,
}: Pick<SetupProps, 'draft' | 'fresh' | 'onApply'> & { agent: Agent; check: ConnectionTest }) {
  const { proposed, replacing, pending, ready } = agent;
  const busy = pending || check.testing;
  const idle = !busy && !draft.input.trim();
  const canReview = proposed && (ready || (draft.deferred && draft.step === 'url'));
  const reviewButton = useRef<HTMLButtonElement>(null);
  const testFailed = draft.messages[draft.messages.length - 1]?.test === 'error';
  useEffect(() => {
    if (ready && !check.testing && !testFailed && !check.paths.length) {
      reviewButton.current?.focus({ preventScroll: true });
    }
  }, [ready, check.testing, testFailed, check.paths.length]);
  if (!canReview && !check.available) {
    return null;
  }
  return (
    <div className="shrink-0 border-t border-border pt-3 pb-2">
      {canReview && !fresh && (replacing || !draft.approved) && (
        <p className="mb-2 text-xs text-muted-foreground">
          {replacing
            ? 'Reviewing replaces your target and starts fresh app settings.'
            : 'Reviewing replaces your current test settings.'}{' '}
          Saved configurations stay unchanged.
        </p>
      )}
      <div className="flex items-start justify-between gap-3">
        {check.available && (
          <div className="min-w-0">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg px-2 sm:px-4"
              aria-describedby="connection-test-disclosure"
              disabled={!idle}
              onClick={() => check.test()}
            >
              {check.testing ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <PlugZap aria-hidden="true" />
              )}
              Test connection
            </Button>
            <p
              id="connection-test-disclosure"
              className="mt-1.5 text-xs text-muted-foreground wrap-anywhere"
            >
              Sends one “Hello” to {check.destination}
              {check.authEnv &&
                ` using ${check.authEnv} in ${check.authHeader === 'Authorization' ? 'Authorization (Bearer)' : check.authHeader}`}
            </p>
          </div>
        )}
        {canReview && (
          <div className="ml-auto shrink-0 text-right">
            <Button
              ref={reviewButton}
              className="rounded-lg px-2 sm:px-4"
              disabled={!idle || !proposed.plugins.length}
              onClick={() => onApply(proposed)}
              aria-describedby="scan-estimate"
            >
              {ready ? 'Review setup' : 'Review draft'} <ArrowRight aria-hidden="true" />
            </Button>
            <p
              id="scan-estimate"
              aria-live="polite"
              className="mt-1.5 text-xs text-muted-foreground"
            >
              {proposed.plugins.length ? (
                <>
                  Scan · <span>~{getEstimatedProbes(proposed).toLocaleString()} requests</span>
                </>
              ) : (
                'Select at least one risk.'
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Introduction({ hasTarget }: { hasTarget: boolean }) {
  return (
    <div className="pb-5 sm:pb-6">
      <div className="mb-4 flex items-center gap-2">
        <AgentAvatar />
        <span className="text-sm font-medium text-muted-foreground">Red team agent</span>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What are we testing?</h2>
      <p className="mt-2 text-base text-muted-foreground">
        {OPENING}{' '}
        {hasTarget
          ? 'I’ll suggest tests and keep your current target unless you change it.'
          : 'I’ll help you connect it and draft tests for review.'}
      </p>
    </div>
  );
}

function Conversation({
  draft,
  setDraft,
  fresh,
  onApply,
  agent,
  check,
}: Pick<SetupProps, 'draft' | 'setDraft' | 'fresh' | 'onApply'> & {
  agent: Agent;
  check: ConnectionTest;
}) {
  const { messages, plan, step } = draft;
  const { pending, proposed, ready } = agent;
  const idle = !pending && !check.testing && !draft.input.trim();
  const lastTurn = useRef<HTMLDivElement>(null);
  const suggestion = useRef<HTMLButtonElement>(null);
  const testResult = messages[messages.length - 1]?.test;
  const logMessages: SetupDraft['messages'] = [
    { role: 'assistant', content: OPENING },
    ...messages,
    ...(pending && draft.input.trim()
      ? [{ role: 'user' as const, content: draft.input.trim() }]
      : []),
  ];
  // Keep the whole latest answer in view when it fits. If the plan is taller
  // than the viewport, start at the reply, so the question or result stays visible.
  let last = logMessages.length - 1;
  while (
    last > 0 &&
    !logMessages[last].test &&
    logMessages[last - 1].role === logMessages[last].role
  ) {
    last--;
  }
  useEffect(() => {
    if (messages.length || pending || check.testing) {
      lastTurn.current?.scrollIntoView({ block: 'start' });
    }
    if (testResult && !check.testing) {
      suggestion.current?.focus({ preventScroll: true });
    }
  }, [messages.length, pending, check.testing, testResult]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pb-4 [mask-image:linear-gradient(transparent,black_1rem,black_calc(100%_-_1rem),transparent)] py-5 sm:py-7">
      <div role="log" aria-label="Setup conversation">
        {logMessages.map((message, index) => {
          const grouped =
            message.role === 'assistant' &&
            !message.test &&
            logMessages[index - 1]?.role === 'assistant';
          return (
            <div
              key={index}
              ref={index === last ? lastTurn : undefined}
              className={cn('scroll-mt-4', index > 0 && (grouped ? 'mt-2' : 'mt-5 sm:mt-6'))}
            >
              <ChatMessage message={message} grouped={grouped} />
            </div>
          );
        })}
      </div>
      {pending || check.testing ? (
        <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {check.testing ? 'Testing the connection…' : 'Thinking…'}
        </p>
      ) : (
        <div className="mt-3 space-y-3 sm:pl-10">
          {check.paths.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {check.paths.map((path, index) => (
                <Button
                  key={path}
                  ref={index === 0 ? suggestion : undefined}
                  variant="outline"
                  size="sm"
                  className="max-w-full rounded-full shadow-none"
                  onClick={() => check.selectPath(path)}
                  disabled={!idle}
                >
                  <span className="truncate">Use {path}</span>
                </Button>
              ))}
            </div>
          )}
          {draft.previousPlan && (
            <Button size="sm" variant="outline" disabled={!idle} onClick={agent.restorePlan}>
              Keep previous tests
            </Button>
          )}
          {isField(step) && (
            <LocalActions
              step={step}
              draft={draft}
              agent={agent}
              check={check}
              fresh={fresh}
              onApply={onApply}
            />
          )}
          {step === 'scope' && !!plan?.plugins.length && (
            <Button variant="outline" size="sm" onClick={agent.resume} disabled={!idle}>
              {draft.interrupted ? 'Back to connection' : 'Keep previous tests'}
            </Button>
          )}
          {step === 'scope' && !plan && agent.target && draft.connection?.openai && (
            <>
              {testResult && !check.paths.length && (
                <p className="text-sm">
                  To choose tests, tell me what the app does and what could go wrong.
                </p>
              )}
              <fieldset
                disabled={!idle}
                aria-label="Proposed connection"
                className="min-w-0 rounded-xl border border-border bg-card text-sm"
              >
                <ConnectionSummary
                  target={agent.target}
                  draft={draft}
                  edit={agent.edit}
                  status={check.available ? (check.status ?? 'untested') : undefined}
                />
              </fieldset>
            </>
          )}
          {ready && proposed && (
            <SetupPlan
              edit={agent.edit}
              draft={draft}
              setDraft={setDraft}
              config={proposed}
              disabled={!idle}
              status={check.available ? (check.status ?? 'untested') : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function Setup({ draft, setDraft, fresh, onApply, onManual, onLoad }: SetupProps) {
  const agent = useSetupAgent(draft, setDraft);
  const check = useConnectionTest(draft, setDraft, agent);
  const { disabled, proposed, hasTarget, pending, ready } = agent;
  const started = draft.messages.length > 0 || pending || check.testing;
  const manualLabel = fresh ? 'Set up manually' : 'Return to configuration';

  return (
    <section className="ph-no-capture mx-auto flex h-full w-full max-w-3xl flex-col px-3 sm:px-6">
      <header className="flex shrink-0 items-center justify-between gap-1 border-b border-border py-2">
        <h1 className="text-sm font-semibold sm:text-base">Red team setup</h1>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (fresh && (isField(draft.step) || ready) && proposed?.plugins.length) {
                onApply(proposed, true);
              } else {
                onManual();
              }
            }}
          >
            {manualLabel}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="px-2"
            aria-label="Load or import config"
            title="Load or import config"
            onClick={onLoad}
          >
            <FolderOpen aria-hidden="true" />
            <span className="hidden sm:inline">Load or import config</span>
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
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            started ? 'pb-2 sm:pb-4' : 'overflow-y-auto py-6 sm:pb-[12dvh]',
          )}
        >
          {started ? (
            <Conversation
              draft={draft}
              setDraft={setDraft}
              agent={agent}
              check={check}
              fresh={fresh}
              onApply={onApply}
            />
          ) : (
            <div className="mt-auto">
              <Introduction hasTarget={hasTarget} />
            </div>
          )}
          {started && (
            <SetupActions
              agent={agent}
              check={check}
              draft={draft}
              fresh={fresh}
              onApply={onApply}
            />
          )}
          <Composer
            draft={draft}
            setDraft={setDraft}
            agent={agent}
            check={check}
            started={started}
          />
          {!started && (
            <div className="mt-5 mb-auto flex flex-wrap items-center gap-x-3 gap-y-2">
              {fresh && (!draft.input || draft.demo) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full shadow-none"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      demo: !draft.demo,
                      input: draft.demo ? '' : DEMO_DESCRIPTION,
                    });
                    agent.clearError();
                  }}
                >
                  <FlaskConical aria-hidden="true" />
                  {draft.demo ? 'Use my own app' : 'Try the demo app'}
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {draft.demo
                  ? 'Send the description to use Promptfoo’s demo app.'
                  : 'No model API key needed for setup. You choose when to run.'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
