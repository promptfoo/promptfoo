import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCache,
  getCacheClearGeneration,
  getCacheWriteContext,
  withCacheNamespace,
} from '../../src/cache';
import cliState from '../../src/cliState';
import { AnthropicCompletionProvider } from '../../src/providers/anthropic/completion';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
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

  it.each(['backend', 'namespace'])(
    'waits for a %s clear before reading an existing provider cache entry',
    async (cleared) => {
      const call = fixture.create();
      const warming = scope('a', 'shared', call);
      await requestStarted.promise;
      await finishRequests();
      expect(await warming).toBe('1');
      const entered = createDeferred<void>();
      const release = createDeferred<void>();
      const store = await scope('a', 'shared', async () => getCache().stores[0]);
      const set = store.set.bind(store);
      const setSpy = vi.spyOn(store, 'set').mockImplementationOnce(async (...args) => {
        entered.resolve();
        await release.promise;
        return set(...args);
      });
      const writing = scope('a', 'shared', () =>
        getCacheWriteContext().set('held-write', 'fixture'),
      );
      await entered.promise;
      const clearing = scope('a', cleared === 'backend' ? '' : 'shared', () => getCache().clear());
      let settled = false;
      const reading = scope('a', 'shared', call).then((value) => {
        settled = true;
        return value;
      });
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(settled).toBe(false);
        expect(requests).toHaveLength(1);
      } finally {
        release.resolve();
        await Promise.all([writing, clearing, reading]);
        setSpy.mockRestore();
      }
      expect(await reading).toBe('2');
      expect(await scope('a', 'shared', call)).toBe('2');
      expect(requests).toHaveLength(2);
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

  if ('poll' in fixture && !fixture.poll) {
    it('does not let a pre-clear failure evict the replacement background response', async () => {
      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'fixture-key',
          background: true,
          headers: { 'OpenAI-Project': 'fixture-project' },
        },
      });
      const call = () => scope('a', 'shared', () => provider.callApi('same prompt'));
      const first = call();
      await requestStarted.promise;
      await scope('a', 'shared', async () => {
        await getCache().clear();
      });
      const replacement = call();
      await new Promise<void>((resolve) => setImmediate(resolve));
      released = true;
      requests[1].resolve(fixture.response(2));
      expect((await replacement).output).toBe('2');
      requests[0].resolve(
        Response.json({ id: 'resp_old', status: 'failed', error: { message: 'fixture failure' } }),
      );
      expect((await first).error).toContain('fixture failure');
      expect(await call()).toMatchObject({ output: '2', cached: true });
      expect(requests).toHaveLength(2);
    });
  }
});

it.each(['messages', 'completion'] as const)(
  'waits for clearing before reusing a labeled Anthropic %s response',
  async (kind) => {
    await cliState.withEnv({ PROMPTFOO_CACHE_TYPE: 'memory', ANTHROPIC_CUSTOM_HEADERS: '' }, () =>
      withCacheNamespace(`anthropic-clear-${kind}`, async () => {
        const provider =
          kind === 'messages'
            ? new AnthropicMessagesProvider('claude-sonnet-4-6', {
                label: 'fixture-tenant',
                config: { apiKey: 'fixture-key' },
              })
            : new AnthropicCompletionProvider('claude-2.1', {
                label: 'fixture-tenant',
                config: { apiKey: 'fixture-key' },
              });
        const create =
          kind === 'messages'
            ? vi
                .spyOn(provider.anthropic.messages, 'create')
                .mockResolvedValueOnce({ content: [{ type: 'text', text: 'old' }] } as any)
                .mockResolvedValueOnce({ content: [{ type: 'text', text: 'fresh' }] } as any)
            : vi
                .spyOn(provider.anthropic.completions, 'create')
                .mockResolvedValueOnce({ completion: 'old' } as any)
                .mockResolvedValueOnce({ completion: 'fresh' } as any);
        expect(await provider.callApi('fixture')).toMatchObject({ output: 'old' });
        const entered = createDeferred<void>();
        const release = createDeferred<void>();
        const store = getCache().stores[0];
        const set = store.set.bind(store);
        const setSpy = vi.spyOn(store, 'set').mockImplementationOnce(async (...args) => {
          entered.resolve();
          await release.promise;
          return set(...args);
        });
        const writing = getCacheWriteContext().set('held-write', 'fixture');
        await entered.promise;
        const clearing = getCache().clear();
        let settled = false;
        const reading = provider.callApi('fixture').then((value) => {
          settled = true;
          return value;
        });
        try {
          await new Promise<void>((resolve) => setImmediate(resolve));
          expect(settled).toBe(false);
          expect(create).toHaveBeenCalledTimes(1);
        } finally {
          release.resolve();
          await Promise.all([writing, clearing, reading]);
          setSpy.mockRestore();
        }
        expect(await reading).toMatchObject({ output: 'fresh' });
        expect(await provider.callApi('fixture')).toMatchObject({
          output: 'fresh',
          cached: true,
        });
        expect(create).toHaveBeenCalledTimes(2);
        create.mockRestore();
      }),
    );
  },
);

it('does not open disk storage when speech policy bypasses response caching', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cache-bypass-'));
  fs.writeFileSync(path.join(directory, 'file'), 'fixture');
  vi.mocked(fetchWithRetries).mockReset().mockResolvedValue(new Response('audio'));
  try {
    await cliState.withEnv(
      {
        PROMPTFOO_CACHE_TYPE: 'disk',
        PROMPTFOO_CACHE_PATH: path.join(directory, 'file', 'cache'),
      },
      async () => {
        const provider = new OpenAiTtsProvider('tts-1', {
          config: {
            apiKey: 'fixture-key',
            apiBaseUrl: 'https://fixture.invalid/v1',
            maxRetries: 0,
          },
        });
        expect(await provider.callApi('fixture')).toMatchObject({
          cached: false,
          audio: { data: Buffer.from('audio').toString('base64') },
        });
      },
    );
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  } finally {
    vi.resetAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
