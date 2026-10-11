import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { importModule } from '../../../src/esm';
import { loadApiProvider } from '../../../src/providers';
import { createDeferred, mockProcessEnv } from '../../util/utils';

import type { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import type { ApiProvider, CallApiContextParams } from '../../../src/types';

const providerIds = ['openai:chat:gpt-4o', 'openrouter:fixture/model', 'snowflake:fixture-model'];
const tools = [{ type: 'function', function: { name: 'fixture', parameters: { type: 'object' } } }];

describe('public Chat executable tool preparation', () => {
  let directory: string;
  let restoreEnvironment: () => void;
  let cacheWasEnabled: boolean;
  let provider: ApiProvider | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'promptfoo-chat-preparation-'));
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      OPENROUTER_API_KEY: 'fixture-key',
      SNOWFLAKE_API_KEY: 'fixture-key',
      SNOWFLAKE_ACCOUNT_IDENTIFIER: 'fixture-account',
    });
    cacheWasEnabled = cache.isCacheEnabled();
    cache.disableCache();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
    await writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  });

  afterEach(async () => {
    await provider?.cleanup?.();
    provider = undefined;
    vi.restoreAllMocks();
    restoreEnvironment();
    if (cacheWasEnabled) {
      cache.enableCache();
    }
    await rm(directory, { recursive: true, force: true });
  });

  async function loadFixture(id: string) {
    const file = path.join(directory, 'tools.js');
    await writeFile(
      file,
      `export const started = Promise.withResolvers();
export const held = Promise.withResolvers();
export let invoked = false;
export let finished = false;
export async function get_tools() {
  invoked = true;
  started.resolve();
  try { return await held.promise; }
  finally { finished = true; }
}
`,
    );
    const fixture = await importModule(file);
    provider = await loadApiProvider(id, {
      options: { config: { tools: `file://${file}:get_tools`, maxRetries: 0 } },
    });
    const context: CallApiContextParams | undefined = id.startsWith('snowflake:')
      ? {
          vars: {},
          prompt: {
            raw: 'fixture',
            label: 'fixture',
            config: { tools: `file://${file}:get_tools` },
          },
        }
      : undefined;
    return { fixture, target: provider, context };
  }

  describe.each(providerIds)('%s', (id) => {
    it.each(['resolve', 'reject'] as const)(
      'rejects while the configured JavaScript function stays held, then observes late %s',
      async (settlement) => {
        const { fixture, target, context } = await loadFixture(id);
        const controller = new AbortController();
        const reason = Object.assign(new Error('cancel held preparation'), { name: 'AbortError' });
        const addListener = vi.spyOn(controller.signal, 'addEventListener');
        const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
        let outcome: unknown;
        const pending = target.callApi('fixture', context, { abortSignal: controller.signal }).then(
          (value) => {
            outcome = value;
          },
          (error) => {
            outcome = error;
          },
        );
        try {
          await vi.waitFor(() => expect(fixture.invoked).toBe(true));
          controller.abort(reason);
          await vi.waitFor(() => expect(outcome).toBe(reason));
          expect(fixture.finished).toBe(false);
          expect(globalThis.fetch).not.toHaveBeenCalled();
          const listeners = addListener.mock.calls.filter(([event]) => event === 'abort');
          expect(listeners.length).toBeGreaterThan(0);
          for (const [event, listener] of listeners) {
            expect(removeListener).toHaveBeenCalledWith(event, listener);
          }
        } finally {
          if (settlement === 'reject' && fixture.invoked) {
            fixture.held.reject(new Error('late independent tool-definition failure'));
          } else {
            fixture.held.resolve(tools);
          }
          await pending;
          if (fixture.invoked) {
            await vi.waitFor(() => expect(fixture.finished).toBe(true));
          }
        }
        expect(outcome).toBe(reason);
        expect(globalThis.fetch).not.toHaveBeenCalled();
      },
    );

    it('sends the configured tools after a live caller finishes preparation', async () => {
      const { fixture, target, context } = await loadFixture(id);
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              { message: { role: 'assistant', content: 'fixture output' }, finish_reason: 'stop' },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
      const controller = new AbortController();
      const pending = target.callApi('fixture', context, { abortSignal: controller.signal });
      try {
        await vi.waitFor(() => expect(fixture.invoked).toBe(true));
      } finally {
        fixture.held.resolve(tools);
      }
      await expect(pending).resolves.toMatchObject({ output: 'fixture output' });
      expect(
        JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]!.body as string).tools,
      ).toEqual(tools);
      expect(fixture.finished).toBe(true);
    });
  });

  it('retains a selected loader failure while its propagation is held across cancellation', async () => {
    const { fixture, target } = await loadFixture('openai:chat:gpt-4o');
    const controller = new AbortController();
    const selected = createDeferred<unknown>();
    const release = createDeferred<void>();
    const chat = target as OpenAiChatCompletionProvider;
    const prepare = chat.getOpenAiBody.bind(chat);
    vi.spyOn(chat, 'getOpenAiBody').mockImplementation(async (...args) => {
      try {
        return await prepare(...args);
      } catch (error) {
        selected.resolve(error);
        await release.promise;
        throw error;
      }
    });
    const pending = target.callApi('fixture', undefined, { abortSignal: controller.signal });
    const outcome = pending.catch((error: unknown) => error);
    try {
      await vi.waitFor(() => expect(fixture.invoked).toBe(true));
      fixture.held.reject(new Error('independent completed preparation failure'));
      const failure = await selected.promise;
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain('independent completed preparation failure');
      controller.abort(new Error('later cancellation'));
      release.resolve();
      await expect(pending).rejects.toBe(failure);
    } finally {
      fixture.held.resolve(tools);
      release.resolve();
      await outcome;
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
