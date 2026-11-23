import { callApi } from '@app/utils/api';
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
    if (!allowed.includes(index)) {
      return [];
    }
    const parsed = SetupConnectionTest.Request.safeParse(target);
    if (!parsed.success) {
      return [];
    }
    const { config, id } = parsed.data;
    const method = (config.method ?? (config.multipart ? 'POST' : 'GET')).toUpperCase();
    return [{ index, target: parsed.data, url: config.url ?? id, method }];
  });
}

export type TestChoice = ReturnType<typeof testChoices>[number];

export async function probe(
  choice: TestChoice,
  keys: Record<string, string> | undefined,
  signal: AbortSignal,
): Promise<Verification> {
  const { index: targetIndex, target } = choice;
  try {
    const response = await callApi('/redteam/setup/connection-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...target, localKeys: keysForTargets([target], keys) }),
      signal,
    });
    if (response.ok) {
      return { ...SetupConnectionTest.Response.parse(await response.json()), targetIndex };
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
