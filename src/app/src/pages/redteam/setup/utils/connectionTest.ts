import { callApi } from '@app/utils/api';
import { isPlainObject } from '@app/utils/isPlainObject';
import { SetupConnectionTest } from '@promptfoo/types/api/redteamSetup';
import { keysForTargets } from './chatCredentials';

export interface Verification {
  success: boolean;
  message: string;
  paths?: string[];
  retryable?: boolean;
  targetIndex: number;
}

export function testChoices(targets: unknown[], allowed: number[] = []) {
  return targets.flatMap((target, index) => {
    // The local server validates eligibility against its installed schema.
    // Read only what we display and send the original native target back.
    if (!allowed.includes(index) || !isPlainObject(target)) {
      return [];
    }
    const config = isPlainObject(target.config) ? target.config : {};
    const url = config.url ?? target.id;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return [];
    }
    const method =
      typeof config.method === 'string'
        ? config.method.toUpperCase()
        : config.multipart
          ? 'POST'
          : 'GET';
    const label = typeof target.label === 'string' ? target.label : undefined;
    return [{ index, target, url, method, label }];
  });
}

export type TestChoice = ReturnType<typeof testChoices>[number];

export async function probe(
  choice: TestChoice,
  keys: Record<string, string> | undefined,
  signal: AbortSignal,
  testPrompt?: string,
): Promise<Verification> {
  const { index: targetIndex, target } = choice;
  try {
    const response = await callApi('/redteam/setup/connection-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...target, localKeys: keysForTargets([target], keys), testPrompt }),
      signal,
    });
    if (response.ok) {
      return { ...SetupConnectionTest.Response.parse(await response.json()), targetIndex };
    }
    if (response.status === 400) {
      return {
        success: false,
        targetIndex,
        message: 'The local server rejected this test before sending a request.',
      };
    }
    if (response.status === 403) {
      return {
        success: false,
        targetIndex,
        message: 'Open Promptfoo on localhost to test the connection from chat.',
      };
    }
  } catch {
    // Transport errors can include credentials. Don't echo them or retry the request.
  }
  return {
    success: false,
    targetIndex,
    message: 'Couldn’t confirm the connection test. Your app may have received it.',
  };
}
