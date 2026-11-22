import { useEffect, useRef } from 'react';

import { Button } from '@app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Textarea } from '@app/components/ui/textarea';
import { cn } from '@app/lib/utils';
import {
  ArrowRight,
  ArrowUp,
  BotMessageSquare,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Cloud,
  FlaskConical,
  FolderOpen,
  Loader2,
  PlugZap,
} from 'lucide-react';
import { useConnectionTest } from '../hooks/useConnectionTest';
import { type SetupDraft, useSetupAgent } from '../hooks/useSetupAgent';
import SetupPlan, { ConnectionSummary } from './SetupPlan';
import { getEstimatedProbes } from './strategies/utils';

import type { Config } from '../types';

const DEMO_DESCRIPTION =
  "Test as a customer shopping at an electronics store. The support bot can look up my orders and update my tickets. It must never show or change another customer's records.";
const OPENING = 'Describe your app and what could go wrong.';
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
  const { error, pending } = agent;
  const busy = pending || check.testing;
  const reply = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!busy && (error || draft.messages.length || draft.demo)) {
      reply.current?.focus({ preventScroll: true });
    }
  }, [draft.messages.length, draft.demo, busy, error]);
  return (
    <form
      className="shrink-0"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && draft.input.trim()) {
          reply.current?.focus({ preventScroll: true });
          agent.send(draft.input.trim());
        }
      }}
    >
      {error && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
          {!draft.input && draft.messages[draft.messages.length - 1]?.role === 'test' && (
            <Button
              type="button"
              variant="link"
              size="sm"
              disabled={busy}
              onClick={() => agent.feedback(draft)}
            >
              Retry agent reply
            </Button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 sm:p-3">
        <Textarea
          ref={reply}
          aria-label="Message the setup agent"
          aria-describedby="setup-privacy"
          rows={started ? 1 : 2}
          className={cn(
            'field-sizing-content min-w-0 flex-1 resize-none! border-0! bg-transparent! px-2! py-1.5! text-base leading-6 focus-visible:ring-0 focus-visible:ring-offset-0',
            started ? 'min-h-9 max-h-[min(20dvh,10rem)]' : 'min-h-20 max-h-[min(32dvh,16rem)]',
          )}
          value={draft.input}
          onChange={(event) => setDraft({ ...draft, input: event.target.value })}
          readOnly={busy}
          placeholder={
            started
              ? 'Message the setup agent…'
              : 'My support bot looks up orders. Customers should only see their own…'
          }
          maxLength={16000}
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
        <Cloud aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        Promptfoo Cloud sees this chat, the draft (including URLs and variable names) and test
        status. Keys are read locally. Never paste them.
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
  const { content, role } = message;
  const test = role === 'test' ? (message.success ? 'success' : 'error') : undefined;
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
      {!grouped &&
        (test ? (
          <PlugZap aria-hidden="true" className="m-1.5 size-4 shrink-0 text-muted-foreground" />
        ) : (
          <AgentAvatar />
        ))}
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
        {!test && <span className="sr-only">Setup agent. </span>}
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
        {test ? (
          <span>
            <strong className="block text-xs">Connection test</strong>
            {content}
          </span>
        ) : (
          content
        )}
      </p>
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
  // A partially configured API isn't runnable. Never promote it to a
  // connected target just because we have its URL.
  const canReview = proposed && (ready || !draft.connection);
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
  agent,
  check,
}: Pick<SetupProps, 'draft' | 'setDraft'> & {
  agent: Agent;
  check: ConnectionTest;
}) {
  const { messages } = draft;
  const { pending, proposed, ready } = agent;
  const idle = !pending && !check.testing && !draft.input.trim();
  const lastTurn = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLParagraphElement>(null);
  const status = check.available ? (check.status ?? 'untested') : undefined;
  const summary = proposed ? (
    <SetupPlan
      draft={draft}
      setDraft={setDraft}
      config={proposed}
      disabled={!idle}
      status={status}
    />
  ) : agent.target || draft.connection ? (
    <div className="rounded-xl border border-border bg-card text-sm">
      <ConnectionSummary target={agent.target} draft={draft} status={status} />
    </div>
  ) : null;

  // Keep the verified result and the agent's interpretation together.
  const last = messages.length - (messages[messages.length - 2]?.role === 'test' ? 2 : 1);
  useEffect(() => {
    if (pending || check.testing) {
      progress.current?.scrollIntoView({ block: 'nearest' });
    } else if (messages.length) {
      lastTurn.current?.scrollIntoView({ block: 'start' });
    }
  }, [messages.length, pending, check.testing]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-pb-4 [mask-image:linear-gradient(transparent,black_1rem,black_calc(100%_-_1rem),transparent)] py-5 sm:py-7">
      <div role="log" aria-label="Setup conversation">
        {messages.map((message, index) => {
          const grouped = message.role === 'assistant' && messages[index - 1]?.role === 'assistant';
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
        <p
          ref={progress}
          role="status"
          className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {check.testing ? 'Testing the connection…' : 'Thinking…'}
        </p>
      ) : (
        summary && (
          <div className="mt-3 sm:pl-10">
            {ready || check.available ? (
              summary
            ) : (
              <details>
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Draft so far
                </summary>
                <div className="mt-2">{summary}</div>
              </details>
            )}
          </div>
        )
      )}
    </div>
  );
}

// Exiting a chat must not silently replace an existing configuration.
function ManualSetup({
  fresh,
  proposed,
  replacing,
  onApply,
  onManual,
}: Pick<SetupProps, 'fresh' | 'onApply' | 'onManual'> & Pick<Agent, 'proposed' | 'replacing'>) {
  if (!fresh && proposed?.plugins.length) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            Manual setup <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={onManual}>Return to configuration</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => onApply(proposed, true)}
            className="flex flex-col items-start gap-1"
            aria-label="Use tests in manual setup"
            aria-describedby="manual-draft-warning"
          >
            Use tests in manual setup
            <span id="manual-draft-warning" className="text-xs text-muted-foreground">
              {replacing
                ? 'Replaces the current target and resets its app settings.'
                : 'Replaces the current test settings.'}{' '}
              Saved configurations stay unchanged.
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        if (fresh && proposed?.plugins.length) {
          onApply(proposed, true);
        } else {
          onManual();
        }
      }}
    >
      {fresh ? 'Set up manually' : 'Return to configuration'}
    </Button>
  );
}

export default function Setup({ draft, setDraft, fresh, onApply, onManual, onLoad }: SetupProps) {
  const agent = useSetupAgent(draft, setDraft);
  const check = useConnectionTest(draft, setDraft, agent);
  const { disabled, hasTarget, pending } = agent;
  const started = draft.messages.length > 0 || pending || check.testing;

  return (
    <section className="ph-no-capture mx-auto flex h-full w-full max-w-3xl flex-col px-3 sm:px-6">
      <header className="flex shrink-0 items-center justify-between gap-1 border-b border-border py-2">
        <h1 className="text-sm font-semibold sm:text-base">Red team setup</h1>
        <div className="flex items-center gap-1">
          <ManualSetup
            fresh={fresh}
            proposed={!disabled && !pending && !check.testing ? agent.proposed : undefined}
            replacing={agent.replacing}
            onApply={onApply}
            onManual={onManual}
          />
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
            <Conversation draft={draft} setDraft={setDraft} agent={agent} check={check} />
          ) : (
            <div className="mt-auto">
              {draft.notice && (
                <p role="status" className="mb-5 text-sm text-muted-foreground">
                  {draft.notice}
                </p>
              )}
              <Introduction hasTarget={hasTarget} />
            </div>
          )}
          {draft.messages.length > 0 && (
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
