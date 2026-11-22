import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { type SetupConnection, SetupConnectionTest } from '@promptfoo/types/api/redteamSetup';
import isEqual from 'fast-deep-equal';
import { toTarget } from '../utils/agentConnection';
import { EXAMPLE_CONFIG } from './useRedTeamConfig';

import type { ProviderOptions } from '../types';
import type { SetupDraft, useSetupAgent } from './useSetupAgent';

const requestTest =
  /^(?:(?:can|could|would) (?:you|we|i) |let['’]s )?(?:please )?(?:test|check|try|verify|ping)(?: (?:the |my |our |this )?(?:connection|endpoint|api|it|that|target|this))?(?: (?:please|now|first|before (?:running|the scan)))?[.!?]*$/i;
const unavailable = 'Couldn’t finish the connection test. Check your local server before retrying.';

// Only offer to test a request we can reproduce. Custom providers, transforms,
// extra headers and other imported settings need the full manual provider tester.
function connectionFor(draft: SetupDraft, target?: ProviderOptions): SetupConnection | undefined {
  if (draft.connection) {
    const { url, body, responsePath, authEnv, authHeader } = draft.connection;
    if (url && body && authEnv !== undefined && authHeader !== null) {
      return { url, body, responsePath, authEnv, authHeader };
    }
    return undefined;
  }
  if (!target || target.id !== 'http') {
    return undefined;
  }
  const { url, body, transformResponse, headers } = target.config;
  const responsePath =
    transformResponse === 'text'
      ? ''
      : typeof transformResponse === 'string' && transformResponse.startsWith('json.')
        ? transformResponse.slice(5)
        : undefined;
  if (typeof url !== 'string' || !body || responsePath === undefined) {
    return undefined;
  }
  const [name, value] = Object.entries(headers ?? {}).find(([key]) => key !== 'Content-Type') ?? [];
  const authHeader = name === 'Authorization' ? undefined : name;
  const authEnv =
    typeof value === 'string'
      ? value.match(/^(?:Bearer )?\{\{env\.([A-Z_][A-Z0-9_]*)\}\}$/)?.[1]
      : '';
  const parsed = SetupConnectionTest.Request.safeParse({
    url,
    body,
    responsePath,
    authEnv,
    authHeader,
  });
  if (!parsed.success) {
    return undefined;
  }
  return isEqual(target, EXAMPLE_CONFIG.target) || isEqual(target, toTarget(parsed.data))
    ? parsed.data
    : undefined;
}

export function connectionStatus(
  draft: SetupDraft,
  target?: ProviderOptions,
): 'success' | 'error' | undefined {
  if (target && draft.tested && isEqual(draft.tested.target, target)) {
    return draft.tested.success ? 'success' : 'error';
  }
  return undefined;
}

export function useConnectionTest(
  draft: SetupDraft,
  setDraft: (draft: SetupDraft) => void,
  agent: ReturnType<typeof useSetupAgent>,
) {
  const { target } = agent;
  const connection = connectionFor(draft, target);
  const destination = connection ? new URL(connection.url).host : '';
  const [testing, setTesting] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const status = connectionStatus(draft, target);

  function send(answer: string) {
    if (request.current || agent.pending) {
      return;
    }
    if (!requestTest.test(answer)) {
      return agent.send(answer);
    }
    if (!connection && !agent.connected) {
      agent.prepareTest(answer);
      return;
    }
    agent.clearError();
    const content = connection
      ? `Select Test connection to send one “Hello” to ${destination}. This won’t start a scan.`
      : 'I can test JSON POST endpoints here. Use manual setup to test this type of target.';
    setDraft({
      ...draft,
      input: '',
      messages: [
        ...draft.messages,
        { role: 'user', content: answer },
        { role: 'assistant', content },
      ],
    });
  }

  async function test() {
    if (!connection || request.current || agent.pending || draft.input.trim()) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setTesting(true);
    agent.clearError();
    const messages: SetupDraft['messages'] = [
      ...draft.messages,
      { role: 'user', content: 'Test connection to ' + destination },
    ];
    setDraft({ ...draft, tested: undefined, messages });
    let result: { success: boolean; message: string; paths?: string[] } = {
      success: false,
      message: unavailable,
    };
    try {
      const response = await callApi('/redteam/setup/connection-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connection),
        signal: controller.signal,
      });
      if (response.ok) {
        result = SetupConnectionTest.Response.parse(await response.json());
      } else if (response.status === 403) {
        result.message = 'Open Promptfoo on localhost to test the connection from chat.';
      }
    } catch {
      // Never echo transport errors. They can include private URLs or credentials.
    }
    if (controller.signal.aborted) {
      return;
    }
    request.current = null;
    setTesting(false);
    const { success, message, paths } = result;
    // A saved chat target can be tested before planning, then corrected in place.
    const editable =
      draft.connection ?? (isEqual(target, EXAMPLE_CONFIG.target) ? undefined : connection);
    setDraft({
      ...draft,
      connection: editable,
      tested: { target, success, paths: editable ? paths : undefined },
      messages: [
        ...messages,
        { role: 'assistant', content: message, test: success ? 'success' : 'error' },
      ],
    });
  }

  return {
    available: !!connection,
    destination,
    authEnv: connection?.authEnv,
    authHeader: connection?.authEnv ? (connection.authHeader ?? 'Authorization') : undefined,
    testing,
    status,
    paths: connection && isEqual(draft.tested?.target, target) ? (draft.tested?.paths ?? []) : [],
    selectPath: agent.chooseTestedPath,
    send,
    test,
  };
}
