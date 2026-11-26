import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { isPlainObject } from '@app/utils/isPlainObject';
import {
  headerVariable,
  localKeysSchema,
  RedteamSetupReplySchema,
} from '@promptfoo/types/api/redteamSetup';
import isEqual from 'fast-deep-equal';
import { captureKeys, displayKeys } from '../utils/chatCredentials';
import { probe, type TestChoice, testChoices, type Verification } from '../utils/connectionTest';

const API_PATH = '/redteam/setup-plan';
const UNAVAILABLE =
  'Could not reach the setup agent. Try sending a message again or set up manually.';
export type NativeConfig = Record<string, unknown>;
interface TestContext {
  remaining: number;
  targetIndex?: number;
}
type Action = { answer: string } | { test: TestChoice } | { feedback: true };

export interface SetupDraft {
  localKeys?: Record<string, string>;
  // First ordinary chat message still eligible to authorize a new connection test.
  consentSince?: number;
  messages: (
    | { role: 'user' | 'assistant'; content: string }
    | { role: 'test'; content: string; success: boolean; destination: string; testPrompt?: string }
  )[];
  input: string;
  demo?: boolean;
  config?: NativeConfig;
  runnable?: boolean;
  runIssue?: string;
  testableTargets?: number[];
  tested?: Verification[];
}

export function targets(config?: NativeConfig): unknown[] {
  const list = config?.targets ?? config?.providers;
  return Array.isArray(list) ? list : list ? [list] : [];
}

export function credentialHeaders(target: unknown): string[] {
  if (
    !isPlainObject(target) ||
    !isPlainObject(target.config) ||
    !isPlainObject(target.config.headers)
  ) {
    return [];
  }
  return Object.entries(target.config.headers)
    .filter(([, value]) => typeof value === 'string' && headerVariable(value))
    .map(([name, value]) => displayKeys(name + ': ' + value));
}

// Only the recent conversation goes to Cloud. Keep earlier user messages
// locally so trimming history doesn't revoke an endpoint or credential grant.
function history(draft: SetupDraft, context?: TestContext, consentSince = 0) {
  let remaining = 48000;
  const turns = draft.messages.filter((m) => m.role !== 'test');
  let start = turns.length;
  while (start > 0 && turns.length - start < 24 && turns[start - 1].content.length <= remaining) {
    start--;
    remaining -= turns[start].content.length;
  }
  const earlier = turns
    .slice(0, start)
    .filter((m) => m.role === 'user')
    .map((m) => m.content);
  return {
    messages: turns.slice(start),
    priorUserTurns: earlier.length ? earlier : undefined,
    testContext: context && {
      ...context,
      consentSince: Math.max(0, consentSince - start),
      customPrompt: true,
    },
  };
}

export function userTurns(draft: SetupDraft) {
  return draft.messages.filter((m) => m.role === 'user').map((m) => m.content);
}

function verification(tested: Verification[] = []) {
  const latest = tested[tested.length - 1];
  if (tested.length < 2) {
    return latest;
  }
  // Earlier tests still apply to unchanged targets. Include their status so the
  // agent can distinguish verified peers from targets that haven't been tried.
  const others = tested
    .slice(-9, -1)
    .map((result) => `target[${result.targetIndex}] ${result.success ? 'passed' : 'failed'}`);
  const status = ' Other current connection tests (zero-based indices): ' + others.join(', ') + '.';
  return { ...latest, message: latest.message.slice(0, 500 - status.length) + status };
}

function applyReply(
  state: SetupDraft,
  reply: ReturnType<typeof RedteamSetupReplySchema.parse>,
): SetupDraft {
  const { message, config, runnable, runIssue, testableTargets } = reply;
  const previous = targets(state.config);
  const next = targets(config ?? state.config);
  return {
    ...state,
    input: '',
    messages: [...state.messages, { role: 'assistant', content: message }],
    config: config ?? state.config,
    runnable,
    runIssue,
    testableTargets,
    tested: state.tested?.filter(
      ({ targetIndex: i }) => testableTargets.includes(i) && isEqual(previous[i], next[i]),
    ),
  };
}

// The server enforces each retest’s destination, method and credentials.
// The browser also knows if the agent cycled back to an earlier failed request.
function canTest(choice: TestChoice, attempted: TestChoice[]) {
  return attempted.every(
    (previous) =>
      previous.index === choice.index &&
      !(previous.url === choice.url && isEqual(previous.target.config, choice.target.config)),
  );
}

export function useSetupAgent(draft: SetupDraft, setDraft: (draft: SetupDraft) => void) {
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [stopped, setStopped] = useState('');
  const [disabled, setDisabled] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    callApi(API_PATH, { signal: controller.signal })
      .then((response) => response.json())
      .then((data) => setDisabled(data.enabled === false))
      .catch(() => {}); // A temporary status failure should not block setup.
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  async function respond(action: Action) {
    if (request.current) {
      return;
    }
    const captured = 'answer' in action && captureKeys(action.answer, draft.localKeys);
    if (captured && !localKeysSchema.safeParse(captured.keys).success) {
      setError('This value cannot be used in an HTTP header. Check it and try again.');
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    request.current = controller;
    setError('');
    setStopped('');
    let next: SetupDraft = captured
      ? {
          ...draft,
          input: '',
          localKeys: captured.keys,
          messages: [...draft.messages, { role: 'user', content: captured.content }],
        }
      : draft;
    // Only a fresh message opens a budget for agent-requested tests. Retrying a
    // lost agent reply or clicking Test connection never grants another request.
    let context: TestContext | undefined = captured ? { remaining: 3 } : undefined;
    let choice = 'test' in action ? action.test : undefined;
    let testPrompt: string | undefined;
    const attempted: TestChoice[] = [];
    try {
      while (!signal.aborted) {
        if (choice) {
          const { index, url, method } = choice;
          attempted.push(choice);
          // Consume earlier consent before dispatch, even if the user stops or
          // leaves chat before a response arrives. Clear any stale success too.
          const others = next.tested?.filter((item) => item.targetIndex !== index) ?? [];
          next = {
            ...next,
            tested: others,
            consentSince: next.messages.filter((m) => m.role !== 'test').length,
          };
          setDraft(next);
          setProgress(`Testing ${method} ${url}…`);
          const result = await probe(choice, next.localKeys, signal, testPrompt);
          if (signal.aborted) {
            return;
          }
          next = {
            ...next,
            tested: [...others, result],
            messages: [
              ...next.messages,
              {
                role: 'test',
                content: result.message,
                success: result.success,
                destination: `${method} ${url}`,
                testPrompt,
              },
            ],
          };
          setDraft(next);
          context =
            !result.success && result.retryable && context && context.remaining > 1
              ? { remaining: context.remaining - 1, targetIndex: index }
              : undefined;
        }
        setProgress(choice ? 'Reviewing the test result…' : 'Thinking…');
        const response = await callApi(API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: 3,
            // Retests within this turn use its original consent boundary.
            ...history(next, context, draft.consentSince),
            config: next.config,
            verification: verification(next.tested),
          }),
          signal,
        });
        const result = await response.json();
        if (signal.aborted) {
          return;
        }
        if (!response.ok) {
          setError(result.error || UNAVAILABLE);
          return;
        }
        const reply = RedteamSetupReplySchema.parse(result);
        next = applyReply(next, reply);
        if (reply.testTarget === undefined) {
          setDraft(next);
          return;
        }
        // Retest exactly the same input after repairs. The next user turn
        // (and the manual Test button) starts fresh.
        if (!attempted.length) {
          testPrompt = reply.testPrompt;
        }
        choice = testChoices(targets(next.config), next.testableTargets).find(
          (item) => item.index === reply.testTarget,
        );
        if (!context || !choice || !canTest(choice, attempted)) {
          setError('Stopped before sending an unexpected or repeated connection test.');
          return;
        }
      }
    } catch {
      if (!signal.aborted) {
        setError(UNAVAILABLE);
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setProgress('');
      }
    }
  }
  function stop() {
    request.current?.abort();
    request.current = null;
    setDraft({ ...draft, consentSince: draft.messages.filter((m) => m.role !== 'test').length });
    setStopped('Stopped. Requests already sent may still reach your app.');
    setProgress('');
  }
  return {
    progress,
    stopped,
    stop,
    disabled,
    error,
    send: (answer: string) => respond({ answer }),
    test: (test: TestChoice) => respond({ test }),
    feedback: () => respond({ feedback: true }),
    clearError: () => setError(''),
  };
}
