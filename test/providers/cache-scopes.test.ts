import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, getCacheClearGeneration, withCacheNamespace } from '../../src/cache';
import cliState from '../../src/cliState';
import {
  MistralChatCompletionProvider,
  MistralEmbeddingProvider,
} from '../../src/providers/mistral';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import { OpenAiResponsesProvider } from '../../src/providers/openai/responses';
import { OpenAiTtsProvider } from '../../src/providers/openai/tts';
import { fetchWithRetries } from '../../src/util/fetch/index';
import { createDeferred } from '../util/utils';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/fetch/index')>()),
  fetchWithRetries: vi.fn(),
}));

// Keep the provider logic, cache manager, namespace selection, and disk stores real.
const cases = [
  {
    name: 'Mistral chat',
    create: () => {
      const provider = new MistralChatCompletionProvider('mistral-small-latest', {
        config: { apiKey: 'fixture-key' },
      });
      return async () => {
        const result = await provider.callApi('same prompt');
        expect(result.error).toBeUndefined();
        return result.output;
      };
    },
    response: (value: number) =>
      Response.json({
        choices: [{ message: { content: String(value) } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
  },
  {
    name: 'Mistral embeddings',
    create: () => {
      const provider = new MistralEmbeddingProvider({
        config: { apiKey: 'fixture-key' },
      });
      return async () => String((await provider.callEmbeddingApi('same prompt')).embedding?.[0]);
    },
    response: (value: number) =>
      Response.json({
        data: [{ embedding: [value] }],
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }),
  },
  {
    name: 'OpenAI moderation',
    create: () => {
      const provider = new OpenAiModerationProvider('omni-moderation-latest', {
        config: { apiKey: 'fixture-key' },
      });
      return async () =>
        String((await provider.callModerationApi('', 'same prompt')).flags?.[0].confidence);
    },
    response: (value: number) =>
      Response.json({
        results: [
          { flagged: true, categories: { violence: true }, category_scores: { violence: value } },
        ],
      }),
  },
  {
    name: 'OpenAI speech',
    create: () => {
      const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'fixture-key' } });
      return async () =>
        Buffer.from((await provider.callApi('same prompt')).audio?.data ?? '', 'base64').toString();
    },
    response: (value: number) => new Response(String(value)),
  },
  ...[false, true].map((poll) => ({
    name: `OpenAI background ${poll ? 'polling' : 'creation'}`,
    poll,
    create: () => {
      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'fixture-key',
          background: true,
          headers: { 'OpenAI-Project': 'fixture-project' },
        },
      });
      return async () => {
        const result = await provider.callApi('same prompt');
        expect(result.error).toBeUndefined();
        return result.output;
      };
    },
    response: (value: number) =>
      Response.json({
        id: 'resp_same_id',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: String(value) }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
  })),
];

describe.each(cases)('$name cache scope', (fixture) => {
  let directory: string;
  let requests: ReturnType<typeof createDeferred<Response>>[];
  let requestStarted: ReturnType<typeof createDeferred<void>>;
  let released = false;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-provider-cache-'));
    requests = [];
    released = false;
    requestStarted = createDeferred<void>();
    vi.mocked(fetchWithRetries)
      .mockReset()
      .mockImplementation(async (_url, options) => {
        if ('poll' in fixture && fixture.poll && options?.method === 'POST') {
          return Response.json({ id: 'resp_same_id', status: 'queued', output: [], usage: null });
        }
        const pending = createDeferred<Response>();
        requests.push(pending);
        requestStarted.resolve();
        if (released) {
          pending.resolve(fixture.response(requests.length));
        }
        return pending.promise;
      });
  });

  afterEach(() => {
    vi.resetAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function scope<T>(backend: string, namespace: string, action: () => Promise<T>) {
    return cliState.withEnv(
      {
        PROMPTFOO_CACHE_TYPE: 'disk',
        PROMPTFOO_CACHE_PATH: path.join(directory, backend),
      },
      () => withCacheNamespace(namespace, action),
    );
  }

  async function finishRequests() {
    // Flush cache-read microtasks before releasing transport, without a timing delay.
    await new Promise<void>((resolve) => setImmediate(resolve));
    released = true;
    requests.forEach((pending, index) => pending.resolve(fixture.response(index + 1)));
  }

  it.each(['backend', 'namespace', 'same scope'])(
    'isolates or coalesces concurrent calls by %s',
    async (difference) => {
      const call = fixture.create();
      const otherBackend = difference === 'backend' ? 'b' : 'a';
      const otherNamespace = difference === 'namespace' ? 'other' : 'shared';
      if (difference === 'namespace') {
        await scope('a', 'shared', async () => getCacheClearGeneration());
        await scope('a', 'other', async () => getCacheClearGeneration());
        // A backend clear gives both namespace states the same generation token.
        await scope('a', '', async () => {
          await getCache().clear();
        });
      }
      const first = scope('a', 'shared', call);
      const second = scope(otherBackend, otherNamespace, call);
      await Promise.race([
        requestStarted.promise,
        first.then((result) => {
          throw new Error(`Provider returned before the mocked request: ${String(result)}`);
        }),
      ]);
      await finishRequests();
      const results = await Promise.all([first, second]);
      const expected = difference === 'same scope' ? ['1', '1'] : ['1', '2'];
      expect([...results].sort()).toEqual(expected);
      expect(requests).toHaveLength(difference === 'same scope' ? 1 : 2);
      // Verify the actual stored results, not just the two initial consumers.
      expect(await scope('a', 'shared', call)).toBe(results[0]);
      expect(await scope(otherBackend, otherNamespace, call)).toBe(results[1]);
      expect(requests).toHaveLength(difference === 'same scope' ? 1 : 2);
    },
  );

  it('does not join or cache a response started before clearing its namespace', async () => {
    const call = fixture.create();
    const first = scope('a', 'shared', call);
    await Promise.race([
      requestStarted.promise,
      first.then((result) => {
        throw new Error(`Provider returned before the mocked request: ${String(result)}`);
      }),
    ]);
    await scope('a', 'shared', async () => {
      await getCache().clear();
    });
    const second = scope('a', 'shared', call);
    await new Promise<void>((resolve) => setImmediate(resolve));
    // Complete the new request first, then the stale response: stale results must not overwrite it.
    released = true;
    requests[1]?.resolve(fixture.response(2));
    requests[0].resolve(fixture.response(1));
    expect(await Promise.all([first, second])).toEqual(['1', '2']);
    expect(requests).toHaveLength(2);
    expect(await scope('a', 'shared', call)).toBe('2');
    expect(requests).toHaveLength(2);
  });
});
