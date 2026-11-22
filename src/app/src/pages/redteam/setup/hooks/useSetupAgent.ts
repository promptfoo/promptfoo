import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { isPlainObject } from '@app/utils/isPlainObject';
import { headerVariable, RedteamSetupReplySchema } from '@promptfoo/types/api/redteamSetup';

const API_PATH = '/redteam/setup-plan';
const UNAVAILABLE =
  'Could not reach the setup agent. Try sending a message again or set up manually.';
export type NativeConfig = Record<string, unknown>;
interface Verification {
  success: boolean;
  message: string;
  paths?: string[];
  targetIndex: number;
}

export interface SetupDraft {
  messages: (
    | { role: 'user' | 'assistant'; content: string }
    | { role: 'test'; content: string; success: boolean; destination: string }
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
    .map(([name, value]) => name + ': ' + value);
}

// Keep the most recent conversation inside the hosted agent's input budget.
// Test results travel separately so an old success cannot verify a new target.
function history(messages: SetupDraft['messages']) {
  let remaining = 48000;
  const turns = messages.filter((m) => m.role !== 'test').slice(-24);
  for (let index = turns.length - 1; index >= 0; index--) {
    remaining -= turns[index].content.length;
    if (remaining < 0) {
      return turns.slice(index + 1);
    }
  }
  return turns;
}

export function userTurns(draft: SetupDraft) {
  return history(draft.messages)
    .filter((m) => m.role === 'user')
    .map((m) => m.content);
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

function applyReply(state: SetupDraft, data: unknown): SetupDraft {
  const { message, config, runnable, runIssue, testableTargets } =
    RedteamSetupReplySchema.parse(data);
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
      ({ targetIndex: i }) =>
        testableTargets.includes(i) && JSON.stringify(previous[i]) === JSON.stringify(next[i]),
    ),
  };
}

export function useSetupAgent(draft: SetupDraft, setDraft: (draft: SetupDraft) => void) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
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

  // A tool result is a new turn. The model may propose a fix, but the user
  // always chooses whether to send another request to the target.
  async function respond(state: SetupDraft, answer?: string) {
    if (pending || request.current) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError('');
    const next: SetupDraft = answer
      ? { ...state, messages: [...state.messages, { role: 'user', content: answer }] }
      : state;
    const payload = {
      version: 3,
      messages: history(next.messages),
      config: state.config,
      verification: verification(state.tested),
    };
    try {
      const response = await callApi(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      setDraft(applyReply(next, result));
    } catch {
      if (!controller.signal.aborted) {
        setError(UNAVAILABLE);
      }
    } finally {
      request.current = null;
      setPending(false);
    }
  }
  return {
    pending,
    disabled,
    error,
    send: (answer: string) => respond(draft, answer),
    feedback: (state: SetupDraft) => respond(state),
    clearError: () => setError(''),
  };
}
