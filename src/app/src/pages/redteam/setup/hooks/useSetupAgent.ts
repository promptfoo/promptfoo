import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import {
  type RedteamSetupPlan,
  RedteamSetupReplySchema,
  type SetupConnectionDraft,
} from '@promptfoo/types/api/redteamSetup';
import isEqual from 'fast-deep-equal';
import { bindConnection, toTarget } from '../utils/agentConnection';
import { applicationDefinitionToPurpose } from '../utils/purposeParser';
import { missingEndpoint } from '../utils/targetDestination';
import { EXAMPLE_CONFIG, useRedTeamConfig } from './useRedTeamConfig';

import type { Config, ProviderOptions } from '../types';

const API_PATH = '/redteam/setup-plan';
const UNAVAILABLE =
  'Could not reach the setup agent. Try sending a message again or set up manually.';
export interface SetupDraft {
  messages: (
    | { role: 'user' | 'assistant'; content: string }
    | { role: 'test'; content: string; success: boolean }
  )[];
  input: string;
  demo?: boolean;
  tested?: {
    target?: ProviderOptions;
    connection?: SetupConnectionDraft;
    result: { success: boolean; message: string; paths?: string[] };
  };
  plan?: RedteamSetupPlan;
  connection?: SetupConnectionDraft;
  excluded?: string[];
  approved?: { config: Config; plan: RedteamSetupPlan };
  notice?: string;
}

function existingTarget(config: Config): ProviderOptions | undefined {
  const target = config.target;
  if (!target?.id || missingEndpoint(target)) {
    return undefined;
  }
  return target;
}

function targetFor(draft: SetupDraft, config: Config) {
  if (draft.connection) {
    return toTarget(draft.connection);
  }
  return draft.demo ? EXAMPLE_CONFIG.target : existingTarget(config);
}

function selectedPlan({ plan, excluded }: SetupDraft) {
  return plan && { ...plan, plugins: plan.plugins.filter(({ id }) => !excluded?.includes(id)) };
}

// Only locally validated connection settings can replace the configured target.
function buildConfig(config: Config, plan: RedteamSetupPlan, draft: SetupDraft): Config {
  const target = targetFor(draft, config) ??
    (draft.connection && toTarget(draft.connection, { partial: true })) ?? {
      id: 'http',
      config: { url: '' },
    };
  const replacing = target && !isEqual(target, config.target);
  // Prompts, examples, extensions and other target-specific settings can contain
  // private data. Never carry them to a replacement target.
  const base = draft.demo
    ? EXAMPLE_CONFIG
    : replacing
      ? useRedTeamConfig.getInitialState().config
      : config;
  const retained = { ...base.applicationDefinition };
  for (const field of Object.keys(draft.approved?.plan.application || {})) {
    delete retained[field as keyof typeof retained];
  }
  const applicationDefinition = {
    ...retained,
    ...plan.application,
    ...(draft.demo && {
      redteamUser: EXAMPLE_CONFIG.applicationDefinition.redteamUser,
      forbiddenData: 'Other customers’ records, including Jane Smith’s (jane.smith@example.com).',
    }),
    purpose: plan.purpose,
  };
  return {
    ...base,
    target,
    applicationDefinition,
    purpose: applicationDefinitionToPurpose(applicationDefinition),
    plugins: plan.plugins.map(({ id }) => id),
    strategies: ['basic'],
    numTests: plan.numTests ?? 3,
  };
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

function verification(draft: SetupDraft) {
  const result = draft.tested?.result;
  if (!result || draft.connection) {
    return result;
  }
  // A saved target was never shared in chat. Keep its field names and errors local.
  return {
    success: result.success,
    message: result.success ? 'Connection test passed.' : 'Connection test failed.',
  };
}

function applyReply(state: SetupDraft, data: unknown): SetupDraft {
  const reply = RedteamSetupReplySchema.safeParse(data);
  if (!reply.success) {
    throw new Error('Reply does not match the setup schema.');
  }
  const { message, plan, connection: proposed } = reply.data;
  const userTurns = state.messages.filter((m) => m.role === 'user').map((m) => m.content);
  if (state.messages[state.messages.length - 1]?.role === 'test') {
    // A test result doesn't grant fresh permission to change credentials or hosts.
    userTurns.push('');
  }
  const connection = proposed
    ? bindConnection(proposed, state.connection, userTurns)
    : state.connection;
  return {
    ...state,
    input: '',
    messages: [...state.messages, { role: 'assistant', content: message }],
    connection,
    tested: isEqual(connection, state.connection) ? state.tested : undefined,
    demo: state.demo && !connection,
    plan: plan ?? state.plan,
    excluded: plan ? undefined : state.excluded,
  };
}

export function useSetupAgent(draft: SetupDraft, setDraft: (draft: SetupDraft) => void) {
  const { config } = useRedTeamConfig();
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
    const previous = selectedPlan(state);
    const payload = {
      version: 2,
      messages: history(next.messages),
      previous: previous?.plugins.length ? previous : undefined,
      connection: state.connection,
      hasTarget: Boolean(!state.connection && targetFor(state, config)),
      verification: verification(state),
    };
    let validationError: string | undefined;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await callApi(API_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, validationError }),
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
        try {
          setDraft(applyReply(next, result));
          return;
        } catch (err) {
          validationError = err instanceof Error ? err.message.slice(0, 500) : 'Invalid setup.';
        }
      }
      setError('Couldn’t verify the proposed changes. Your draft is unchanged. ' + validationError);
    } catch {
      if (!controller.signal.aborted) {
        setError(UNAVAILABLE);
      }
    } finally {
      request.current = null;
      setPending(false);
    }
  }
  const selected = selectedPlan(draft);
  const proposed = selected && buildConfig(config, selected, draft);
  const target = targetFor(draft, config);
  return {
    pending,
    disabled,
    error,
    send: (answer: string) => respond(draft, answer),
    feedback: (state: SetupDraft) => respond(state),
    clearError: () => setError(''),
    proposed,
    target,
    ready: Boolean(target && proposed),
    replacing: proposed && !isEqual(proposed.target, config.target),
    hasTarget: Boolean(existingTarget(config)),
  };
}
