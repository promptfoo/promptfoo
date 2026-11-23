import { useEffect, useRef, useState } from 'react';

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
  PlugZap,
  Square,
} from 'lucide-react';
import { EXAMPLE_CONFIG } from '../hooks/useRedTeamConfig';
import { credentialHeaders, type SetupDraft, targets, useSetupAgent } from '../hooks/useSetupAgent';
import { displayKeys } from '../utils/chatCredentials';
import { testChoices } from '../utils/connectionTest';
import { getRuntimeRedteamConfig } from '../utils/yamlHelpers';
import SetupPlan from './SetupPlan';

const DEMO_DESCRIPTION =
  "Test the demo support bot at https://customer-service-chatbot-example.promptfoo.app as john.doe@example.com. It can look up my orders and update my tickets. It must never reveal or change another customer's records. Start with a small scan.";
// Seed the public connection, prompt and session ID, never editor state.
function demoConfig() {
  const { targets, prompts, defaultTest } = getRuntimeRedteamConfig(EXAMPLE_CONFIG);
  return { targets, prompts, defaultTest };
}

interface SetupProps {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft) => void;
  fresh: boolean;
  onReview: () => void;
  onManual: () => void;
  onLoad: () => void;
}

type Agent = ReturnType<typeof useSetupAgent>;

function Composer({
  draft,
  setDraft,
  agent,
  started,
}: Pick<SetupProps, 'draft' | 'setDraft'> & {
  agent: Agent;
  started: boolean;
}) {
  const { error, stopped } = agent;
  const busy = Boolean(agent.progress);
  const reply = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!busy && (error || stopped || draft.messages.length || draft.demo)) {
      reply.current?.focus({ preventScroll: true });
    }
  }, [draft.messages.length, draft.demo, busy, error, stopped]);
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
      {stopped && !error && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          {stopped}
        </p>
      )}
      {error && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
          {!draft.input && draft.messages[draft.messages.length - 1]?.role === 'test' && (
            <Button type="button" variant="link" size="sm" disabled={busy} onClick={agent.feedback}>
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
          value={busy ? '' : draft.input}
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
        {busy ? (
          <Button
            key="stop"
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0 rounded-xl"
            aria-label="Stop agent"
            title="Stop agent"
            onClick={agent.stop}
          >
            <Square aria-hidden="true" className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            disabled={!draft.input.trim()}
            className="shrink-0 rounded-xl disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
            aria-label="Send reply"
            title="Send reply (Enter)"
          >
            <ArrowUp aria-hidden="true" />
          </Button>
        )}
      </div>
      <p
        id="setup-privacy"
        className="mt-2 flex items-start gap-1.5 px-1 text-xs text-muted-foreground"
      >
        <Cloud aria-hidden="true" className="mt-px size-3.5 shrink-0" />
        Promptfoo Cloud sees this chat, your draft (including URLs and variable names) and test
        status. Recognized keys stay local. Chat can miss secrets in free text.
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
  const { role } = message;
  const content = displayKeys(message.content);
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
            <strong className="block text-xs">
              Connection test {message.role === 'test' && '· ' + message.destination}
            </strong>
            {message.role === 'test' && message.testPrompt !== undefined && (
              <span className="block max-h-24 overflow-y-auto text-sm">
                Prompt ·{' '}
                <span>
                  {message.testPrompt === '' ? '(empty message)' : displayKeys(message.testPrompt)}
                </span>
              </span>
            )}
            {content}
          </span>
        ) : (
          // Format field names without rendering links, images, or HTML from the model.
          content.split(/(`[^`\n]+`)/g).map((part, i) =>
            i % 2 ? (
              <code key={i} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
                {part.slice(1, -1)}
              </code>
            ) : (
              part
            ),
          )
        )}
      </p>
    </div>
  );
}

function SetupActions({
  agent,
  draft,
  onReview,
}: Pick<SetupProps, 'draft' | 'onReview'> & { agent: Agent }) {
  const [index, select] = useState(0);
  const choices = testChoices(targets(draft.config), draft.testableTargets);
  const selected = choices.find((choice) => choice.index === index) ?? choices[0];
  const headers = credentialHeaders(selected?.target);
  const idle = !agent.progress && !draft.input.trim();
  if (!draft.config) {
    return null;
  }
  return (
    <div className="shrink-0 border-t border-border pt-3 pb-2">
      {!agent.progress && choices.length > 1 && (
        <label className="mb-2 flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 text-muted-foreground">Test target</span>
          <select
            className="min-w-0 rounded border border-border bg-card p-1"
            disabled={!idle}
            value={selected?.index}
            onChange={(e) => select(Number(e.target.value))}
          >
            {choices.map((choice) => (
              <option key={choice.index} value={choice.index}>
                {choice.index + 1}. {choice.label && choice.label + ' · '}
                {choice.url}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex items-start justify-between gap-2">
        {selected && (
          <Button
            type="button"
            variant="outline"
            className="rounded-lg px-2 sm:px-4"
            aria-describedby="connection-test-disclosure"
            disabled={!idle}
            onClick={() => agent.test(selected)}
          >
            <PlugZap aria-hidden="true" />
            Test connection
          </Button>
        )}
        <Button
          className="ml-auto rounded-lg px-2 sm:px-4"
          variant={draft.runnable ? 'default' : 'outline'}
          disabled={!idle}
          onClick={onReview}
        >
          {draft.runnable ? 'Review setup' : 'Review draft'} <ArrowRight aria-hidden="true" />
        </Button>
      </div>
      {!agent.progress && selected && (
        <p
          id="connection-test-disclosure"
          className="mt-1.5 max-h-[12dvh] overflow-auto text-xs text-muted-foreground wrap-anywhere"
        >
          Sends one {selected.method} to {selected.url}
          {headers.length > 0 && ' using ' + headers.join(', ')}. Uses “Hello” for{' '}
          <code>{'{{prompt}}'}</code> if present.
        </p>
      )}
    </div>
  );
}

function Introduction({ fresh }: { fresh: boolean }) {
  return (
    <div className="pb-5 sm:pb-6">
      <div className="mb-4 flex items-center gap-2">
        <AgentAvatar />
        <span className="text-sm font-medium text-muted-foreground">Red team agent</span>
      </div>
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What are we testing?</h2>
      <p className="mt-2 text-base text-muted-foreground">
        Describe your app or paste a configuration. Ask the agent to test and fix your connection
        and it can send up to three requests. You can specify a test message. You decide when to run
        the scan.
        {!fresh &&
          ' This chat starts a separate draft. Your manual configuration stays private and unchanged.'}
      </p>
    </div>
  );
}

function Conversation({
  draft,
  agent,
}: Pick<SetupProps, 'draft'> & {
  agent: Agent;
}) {
  const { messages } = draft;
  const pending = agent.progress;
  const lastTurn = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLParagraphElement>(null);
  const summary = draft.config && <SetupPlan draft={draft} />;

  // Keep the verified result and the agent's interpretation together.
  const last = messages.length - (messages[messages.length - 2]?.role === 'test' ? 2 : 1);
  useEffect(() => {
    if (pending) {
      progress.current?.scrollIntoView({ block: 'nearest' });
    } else if (messages.length) {
      lastTurn.current?.scrollIntoView({ block: 'start' });
    }
  }, [messages.length, pending]);
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
      {pending ? (
        <p
          ref={progress}
          role="status"
          className="mt-4 flex items-center gap-2 text-sm text-muted-foreground wrap-anywhere"
        >
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          {pending}
        </p>
      ) : (
        summary && (
          <div className="mt-3 sm:pl-10">
            {draft.runnable || Boolean(draft.testableTargets?.length) ? (
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

export default function Setup({ draft, setDraft, fresh, onReview, onManual, onLoad }: SetupProps) {
  const agent = useSetupAgent(draft, setDraft);
  const { disabled } = agent;
  const started = draft.messages.length > 0 || Boolean(agent.progress);

  return (
    <section className="ph-no-capture mx-auto flex h-full w-full max-w-3xl flex-col px-3 sm:px-6">
      <header className="flex shrink-0 items-center justify-between gap-1 border-b border-border py-2">
        <h1 className="text-sm font-semibold sm:text-base">Red team setup</h1>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onManual}>
            {fresh ? 'Set up manually' : 'Return to configuration'}
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
            <Conversation draft={draft} agent={agent} />
          ) : (
            <div className="mt-auto">
              <Introduction fresh={fresh} />
            </div>
          )}
          {draft.messages.length > 0 && (
            <SetupActions agent={agent} draft={draft} onReview={onReview} />
          )}
          <Composer draft={draft} setDraft={setDraft} agent={agent} started={started} />
          {!started && (
            <div className="mt-5 mb-auto flex flex-wrap items-center gap-x-3 gap-y-2">
              {(!draft.input || draft.demo) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full shadow-none"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      demo: !draft.demo,
                      config: draft.demo ? undefined : demoConfig(),
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
                  : 'No model API key needed for setup.'}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
