import { useEffect, useRef, useState } from 'react';

import { callApi } from '@app/utils/api';
import { SetupConnectionTest } from '@promptfoo/types/api/redteamSetup';
import { credentialHeaders, type SetupDraft, targets, type useSetupAgent } from './useSetupAgent';

const unavailable = 'Couldn’t finish the connection test. Check your local server before retrying.';

export function useConnectionTest(
  draft: SetupDraft,
  setDraft: (draft: SetupDraft) => void,
  agent: ReturnType<typeof useSetupAgent>,
) {
  const [testing, setTesting] = useState(false);
  const [index, select] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  // Only the local server can grant permission to test a specific native target.
  const choices = targets(draft.config).flatMap((target, i) => {
    if (!draft.testableTargets?.includes(i)) {
      return [];
    }
    const parsed = SetupConnectionTest.Request.safeParse(target);
    if (!parsed.success) {
      return [];
    }
    const url = parsed.data.config.url ?? parsed.data.id;
    return [{ index: i, target: parsed.data, url }];
  });
  const selected = choices.find((choice) => choice.index === index) ?? choices[0];
  const headers = credentialHeaders(selected?.target);

  async function test() {
    if (!selected || request.current || agent.pending || draft.input.trim()) {
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
        body: JSON.stringify(selected.target),
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
      tested: [
        ...(draft.tested ?? []).filter((item) => item.targetIndex !== selected.index),
        { ...result, targetIndex: selected.index },
      ],
      messages: [
        ...draft.messages,
        { role: 'test', content: message, success, destination: selected.url },
      ],
    };
    setDraft(updated);
    await agent.feedback(updated);
  }

  return { choices, selected, select, headers, testing, test };
}
