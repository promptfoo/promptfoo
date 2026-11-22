import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { type SetupConnection, SetupConnectionTest } from '@promptfoo/types/api/redteamSetup';
import isEqual from 'fast-deep-equal';
import { toTarget } from '../utils/agentConnection';
import { EXAMPLE_CONFIG } from './useRedTeamConfig';

import type { ProviderOptions } from '../types';
import type { SetupDraft, useSetupAgent } from './useSetupAgent';

const unavailable = 'Couldn’t finish the connection test. Check your local server before retrying.';

// Only offer to test a request we can reproduce. Custom providers, transforms,
// extra headers and other imported settings need the full manual provider tester.
function connectionFor(draft: SetupDraft, target?: ProviderOptions): SetupConnection | undefined {
  if (draft.connection) {
    const parsed = SetupConnectionTest.Request.safeParse(draft.connection);
    return parsed.success ? parsed.data : undefined;
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
  if (
    draft.tested &&
    isEqual(draft.tested.target, target) &&
    isEqual(draft.tested.connection, draft.connection)
  ) {
    return draft.tested.result.success ? 'success' : 'error';
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

  async function test() {
    if (!connection || request.current || agent.pending || draft.input.trim()) {
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setTesting(true);
    agent.clearError();
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
    const { success, message } = result;
    const updated: SetupDraft = {
      ...draft,
      tested: { target, connection: draft.connection, result },
      messages: [...draft.messages, { role: 'test', content: message, success }],
    };
    setDraft(updated);
    await agent.feedback(updated);
  }

  return {
    available: !!connection,
    destination,
    authEnv: connection?.authEnv,
    authHeader: connection?.authEnv ? (connection.authHeader ?? 'Authorization') : undefined,
    testing,
    status,
    test,
  };
}
