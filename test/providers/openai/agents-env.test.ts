import {
  Agent,
  type Model,
  OpenAIProvider,
  setDefaultModelProvider,
  setTracingDisabled,
  Usage,
} from '@openai/agents';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { loadApiProvider } from '../../../src/providers/index';
import { OpenAiAgentsProvider } from '../../../src/providers/openai/agents';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import { createDeferred, mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));
let restoreEnv = () => {};
const response = {
  id: 'resp_fixture',
  object: 'response',
  created_at: 0,
  model: 'gpt-4.1-mini',
  status: 'completed',
  output: [
    {
      id: 'msg_fixture',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: 'ok', annotations: [] }],
    },
  ],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
};

beforeEach(() => {
  setTracingDisabled(true);
  restoreEnv = mockProcessEnv({
    OPENAI_API_KEY: 'host-key',
    OPENAI_BASE_URL: undefined,
    OPENAI_API_BASE_URL: undefined,
    OPENAI_API_HOST: undefined,
    OPENAI_ORGANIZATION: undefined,
  });
  vi.mocked(fetchWithProxy).mockImplementation(async () => Response.json(response));
});
afterEach(() => {
  restoreEnv();
  setDefaultModelProvider(new OpenAIProvider());
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

function provider(config = {}, env = {}) {
  return new OpenAiAgentsProvider('fixture', {
    config: {
      agent: new Agent({ name: 'fixture', model: 'gpt-4.1-mini', instructions: 'Echo ok.' }),
      ...config,
    },
    env,
  });
}

function request() {
  const [url, options] = vi.mocked(fetchWithProxy).mock.calls.at(-1)!;
  return {
    url: String(url),
    headers: new Headers(options?.headers),
    body: JSON.parse(options?.body as string),
  };
}

describe('Agents SDK scoped client', () => {
  it('passes provider key, endpoint, and organization to the actual SDK request', async () => {
    const result = await provider(
      {},
      {
        OPENAI_API_KEY: 'provider-key',
        OPENAI_BASE_URL: 'https://fixture.example/v1',
        OPENAI_ORGANIZATION: 'provider-org',
      },
    ).callApi('hello');
    expect(result.output).toBe('ok');
    expect(request().url).toBe('https://fixture.example/v1/responses');
    expect(request().headers.get('authorization')).toBe('Bearer provider-key');
    expect(request().headers.get('openai-organization')).toBe('provider-org');
  });

  it.each([
    ['OPENAI_API_HOST', 'gateway.example.invalid'],
    ['OPENAI_API_BASE_URL', 'https://gateway.example.invalid/v1'],
    ['OPENAI_BASE_URL', 'https://gateway.example.invalid/v1'],
  ])('honors process-only %s', async (name, value) => {
    mockProcessEnv({ [name]: value });
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    vi.spyOn(custom, 'getModel').mockRejectedValue(new Error('default provider bypassed gateway'));
    setDefaultModelProvider(custom);

    await provider().callApi('hello');
    expect(request().url).toBe('https://gateway.example.invalid/v1/responses');
    expect(request().headers.get('authorization')).toBe('Bearer host-key');
  });

  it('applies a retry budget configured without other connection settings', async () => {
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    vi.spyOn(custom, 'getModel').mockRejectedValue(new Error('default provider bypassed retries'));
    setDefaultModelProvider(custom);
    vi.mocked(fetchWithProxy).mockResolvedValue(
      Response.json({ error: 'retry fixture' }, { status: 409 }),
    );

    await expect(provider({ maxRetries: 0 }).callApi('hello')).rejects.toThrow('409');
    expect(fetchWithProxy).toHaveBeenCalledOnce();
  });

  it('uses explicit connection config ahead of scoped values', async () => {
    await cliState.withEnv({ OPENAI_API_KEY: 'suite-key' }, () =>
      provider({ apiKey: 'config-key', apiBaseUrl: 'https://config.example/v1' }).callApi('hello'),
    );
    expect(request().headers.get('authorization')).toBe('Bearer config-key');
    expect(request().url).toBe('https://config.example/v1/responses');
  });

  it('isolates sequential invocation-file credentials on a reused provider', async () => {
    const target = provider();
    for (const key of ['first-key', 'second-key']) {
      await cliState.withEnvFileOverrides({ OPENAI_API_KEY: key }, () => target.callApi('hello'));
      expect(request().headers.get('authorization')).toBe(`Bearer ${key}`);
    }
    expect(process.env.OPENAI_API_KEY).toBe('host-key');
  });

  it('isolates overlapping suites without changing process credentials', async () => {
    const calls: string[] = [];
    const pending = createDeferred<void>();
    vi.mocked(fetchWithProxy).mockImplementation(async (_url, options) => {
      calls.push(new Headers(options?.headers).get('authorization')!);
      if (calls.length === 2) {
        pending.resolve();
      }
      await pending.promise;
      return Response.json(response);
    });
    const target = provider();
    await Promise.all(
      ['suite-a', 'suite-b'].map((key) =>
        cliState.withEnv({ OPENAI_API_KEY: key }, () => target.callApi('hello')),
      ),
    );
    expect(calls.sort()).toEqual(['Bearer suite-a', 'Bearer suite-b']);
    expect(process.env.OPENAI_API_KEY).toBe('host-key');
  });

  it.each([false, true])('preserves a custom SDK model (scoped=%s)', async (scoped) => {
    const model: Model = {
      getResponse: vi.fn<Model['getResponse']>(async () => ({
        usage: new Usage({ inputTokens: 1, outputTokens: 1 }),
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'custom' }],
          },
        ],
      })),
      async *getStreamedResponse() {
        throw new Error('Streaming is not used');
      },
    };
    const target = provider(
      { agent: new Agent({ name: 'custom', model }) },
      scoped ? { OPENAI_API_KEY: '' } : {},
    );
    expect((await target.callApi('hello')).output).toBe('custom');
    expect(model.getResponse).toHaveBeenCalledOnce();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('keeps the SDK default model provider when connection settings are absent', async () => {
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    const getModel = vi
      .spyOn(custom, 'getModel')
      .mockRejectedValue(new Error('custom model provider selected'));
    setDefaultModelProvider(custom);
    await expect(provider().callApi('hello')).rejects.toThrow('custom model provider selected');
    expect(getModel).toHaveBeenCalledOnce();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('honors a differently cased organization header without combining values', async () => {
    await provider({
      organization: 'config-org',
      headers: { 'openai-organization': 'header-org' },
    }).callApi('hello');
    expect(request().headers.get('openai-organization')).toBe('header-org');
  });

  it('honors a provider endpoint alias over an ambient host alias', async () => {
    const target = await loadApiProvider('openai:agents:fixture', {
      env: { OPENAI_API_HOST: 'suite.example.invalid' },
      options: {
        config: { agent: new Agent({ name: 'fixture', model: 'gpt-4.1-mini' }) },
        env: {
          OPENAI_BASE_URL: 'https://provider.example.invalid/v1',
          OPENAI_API_KEY: 'provider-key',
        },
      },
    });
    await cliState.withEnv({ OPENAI_API_HOST: 'suite.example.invalid' }, () =>
      target.callApi('hello'),
    );
    expect(request().url).toBe('https://provider.example.invalid/v1/responses');
  });

  it('masks an empty endpoint alias before considering lower scopes', async () => {
    const target = provider({}, { OPENAI_API_HOST: '' });
    await cliState.withEnv(
      {
        OPENAI_API_HOST: 'masked.example.invalid',
        OPENAI_BASE_URL: 'https://fallback.example.invalid/v1',
      },
      () => target.callApi('hello'),
    );
    expect(request().url).toBe('https://fallback.example.invalid/v1/responses');
    await cliState.withEnv({ OPENAI_API_HOST: 'masked.example.invalid' }, () =>
      target.callApi('hello'),
    );
    expect(request().url).toBe('https://api.openai.com/v1/responses');
  });

  it('preserves gateway query parameters in the SDK request URL', async () => {
    await provider({
      apiBaseUrl: 'https://gateway.example.invalid/v1?api-version=fixture&route=tenant',
    }).callApi('hello');
    const url = new URL(request().url);
    expect(url.pathname).toBe('/v1/responses');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      'api-version': 'fixture',
      route: 'tenant',
    });
  });

  it('preserves repeated and encoded gateway query parameters', async () => {
    await provider({
      apiBaseUrl: 'https://gateway.example.invalid/v1?scope=read&scope=write&route=a%20b',
    }).callApi('hello');
    expect(new URL(request().url).search).toBe('?scope=read&scope=write&route=a%20b');
  });

  it.each([undefined, 0, 1])('honors direct-call retry budget %s', async (maxRetries) => {
    vi.mocked(fetchWithProxy).mockImplementation(async () =>
      Response.json(
        { error: { message: 'fixture transient' } },
        { status: 503, headers: { 'retry-after-ms': '0' } },
      ),
    );
    await expect(provider({ apiKey: 'fixture-key', maxRetries }).callApi('hello')).rejects.toThrow(
      'fixture transient',
    );
    expect(fetchWithProxy).toHaveBeenCalledTimes((maxRetries ?? 2) + 1);
    expect(vi.mocked(fetchWithProxy).mock.calls[0][1]?.disableTransientRetries).toBe(true);
  });

  it('can omit authentication for an explicitly keyless compatible endpoint', async () => {
    await provider(
      {
        apiKeyRequired: false,
        apiBaseUrl: 'https://local.example.invalid/v1',
        headers: { 'X-Gateway-Auth': 'fixture' },
      },
      { OPENAI_API_KEY: '' },
    ).callApi('hello');
    expect(request().headers.has('authorization')).toBe(false);
    expect(request().headers.get('x-gateway-auth')).toBe('fixture');
  });

  it.each(['openai-conversations', 'openai-responses-compaction'] as const)(
    'scopes owned %s session requests with model requests',
    async (type) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unscoped session client')));
      const paths: string[] = [];
      vi.mocked(fetchWithProxy).mockImplementation(async (input, options) => {
        const url = new URL(String(input));
        expect(url.origin).toBe('https://scoped.example.invalid');
        expect(new Headers(options?.headers).get('authorization')).toBe('Bearer session-key');
        paths.push(url.pathname);
        if (url.pathname === '/v1/conversations') {
          return Response.json({
            id: 'conv_fixture',
            object: 'conversation',
            created_at: 0,
            metadata: {},
          });
        }
        if (url.pathname.includes('/items')) {
          return Response.json({
            data: [],
            object: 'list',
            first_id: null,
            last_id: null,
            has_more: false,
          });
        }
        if (url.pathname === '/v1/responses/compact') {
          return Response.json({
            id: 'cmp_fixture',
            object: 'response.compaction',
            created_at: 0,
            output: [],
            usage: response.usage,
          });
        }
        return Response.json(response);
      });
      try {
        const target = provider(
          {
            session: {
              type,
              ...(type === 'openai-responses-compaction' && {
                shouldTriggerCompaction: () => true,
              }),
            },
          },
          { OPENAI_API_KEY: 'session-key', OPENAI_BASE_URL: 'https://scoped.example.invalid/v1' },
        );
        expect((await target.callApi('hello')).output).toBe('ok');
        expect(paths).toContain('/v1/responses');
        expect(paths).toContain(
          type === 'openai-conversations' ? '/v1/conversations' : '/v1/responses/compact',
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('keeps owned conversations within an invocation when a provider is reused', async () => {
    const created: string[] = [];
    vi.mocked(fetchWithProxy).mockImplementation(async (input, options) => {
      const url = new URL(String(input));
      const auth = new Headers(options?.headers).get('authorization')!;
      const tenant = auth.slice('Bearer '.length);
      expect(url.hostname).toBe(`${tenant}.example.invalid`);
      if (url.pathname === '/v1/conversations') {
        created.push(tenant);
        return Response.json({
          id: `conv_${tenant}`,
          object: 'conversation',
          created_at: 0,
          metadata: {},
        });
      }
      if (url.pathname.includes('/items')) {
        expect(url.pathname).toContain(`conv_${tenant}`);
        return Response.json({
          data: [],
          object: 'list',
          first_id: null,
          last_id: null,
          has_more: false,
        });
      }
      return Response.json(response);
    });
    const target = provider({ session: { type: 'openai-conversations' } });
    await Promise.all(
      ['first', 'second'].map((tenant) =>
        cliState.withEnv(
          { OPENAI_API_KEY: tenant, OPENAI_BASE_URL: `https://${tenant}.example.invalid/v1` },
          async () => {
            await target.callApi('first turn');
            await target.callApi('second turn');
          },
        ),
      ),
    );
    expect(created.sort()).toEqual(['first', 'second']);
  });

  it('preserves an explicitly supplied inline session client', async () => {
    const sessionFetch = vi.fn(async () =>
      Response.json({ data: [], object: 'list', first_id: null, last_id: null, has_more: false }),
    );
    const client = new OpenAI({
      apiKey: 'owned-session-key',
      baseURL: 'https://session.example.invalid/v1',
      fetch: sessionFetch,
    });
    await provider(
      { session: { type: 'openai-conversations', conversationId: 'conv_owned', client } },
      { OPENAI_API_KEY: 'model-key' },
    ).callApi('hello');
    expect(request().headers.get('authorization')).toBe('Bearer model-key');
    expect(sessionFetch).toHaveBeenCalled();
    const [url, options] = sessionFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('https://session.example.invalid/v1/conversations/conv_owned/items');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer owned-session-key');
  });

  it('preserves explicit inline session connection settings', async () => {
    const calls: { url: string; auth: string | null; org: string | null }[] = [];
    vi.mocked(fetchWithProxy).mockImplementation(async (input, options) => {
      const headers = new Headers(options?.headers);
      calls.push({
        url: String(input),
        auth: headers.get('authorization'),
        org: headers.get('openai-organization'),
      });
      return String(input).includes('/items')
        ? Response.json({
            data: [],
            object: 'list',
            first_id: null,
            last_id: null,
            has_more: false,
          })
        : Response.json(response);
    });
    await provider(
      {
        organization: 'model-org',
        session: {
          type: 'openai-conversations',
          conversationId: 'conv_owned',
          apiKey: 'session-key',
          baseURL: 'https://session.example.invalid/v1',
          organization: 'session-org',
        },
      },
      { OPENAI_API_KEY: 'model-key' },
    ).callApi('hello');
    expect(calls.find((call) => call.url.includes('/items'))).toMatchObject({
      auth: 'Bearer session-key',
      org: 'session-org',
    });
    expect(calls.find((call) => call.url.endsWith('/responses'))).toMatchObject({
      auth: 'Bearer model-key',
      org: 'model-org',
    });
  });

  it('shares gateway headers when a session only supplies its conversation ID', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (input) =>
      String(input).includes('/items')
        ? Response.json({
            data: [],
            object: 'list',
            first_id: null,
            last_id: null,
            has_more: false,
          })
        : Response.json(response),
    );
    await provider({
      apiKey: 'fixture-key',
      headers: { 'X-Gateway-Auth': 'fixture' },
      session: { type: 'openai-conversations', conversationId: 'conv_fixture' },
    }).callApi('hello');
    expect(vi.mocked(fetchWithProxy).mock.calls.length).toBeGreaterThan(1);
    for (const [, options] of vi.mocked(fetchWithProxy).mock.calls) {
      expect(new Headers(options?.headers).get('x-gateway-auth')).toBe('fixture');
    }
  });

  it.each([undefined, 'session-project'])(
    'isolates an explicit session with project=%s',
    async (project) => {
      mockProcessEnv({ OPENAI_PROJECT_ID: 'host-project' });
      const calls: { path: string; headers: Headers }[] = [];
      vi.mocked(fetchWithProxy).mockImplementation(async (input, options) => {
        const path = new URL(String(input)).pathname;
        calls.push({ path, headers: new Headers(options?.headers) });
        return path.includes('/items')
          ? Response.json({
              data: [],
              object: 'list',
              first_id: null,
              last_id: null,
              has_more: false,
            })
          : Response.json(response);
      });
      await provider({
        apiKey: 'model-key',
        headers: {
          Authorization: 'Bearer gateway-key',
          'X-API-Key': 'gateway-key',
          'OpenAI-Organization': 'gateway-org',
        },
        session: {
          type: 'openai-conversations',
          conversationId: 'conv_fixture',
          baseURL: 'https://session.example.invalid/v1',
          apiKey: 'session-key',
          organization: 'session-org',
          project,
        },
      }).callApi('hello');
      const sessionHeaders = calls.find((call) => call.path.includes('/items'))!.headers;
      expect(sessionHeaders.get('authorization')).toBe('Bearer session-key');
      expect(sessionHeaders.get('x-api-key')).toBeNull();
      expect(sessionHeaders.get('openai-organization')).toBe('session-org');
      expect(sessionHeaders.get('openai-project')).toBe(project ?? null);
      const modelHeaders = calls.find((call) => call.path.endsWith('/responses'))!.headers;
      expect(modelHeaders.get('authorization')).toBe('Bearer gateway-key');
      expect(modelHeaders.get('x-api-key')).toBe('gateway-key');
      expect(modelHeaders.get('openai-project')).toBe('host-project');
    },
  );

  it('preserves an SDK request-specific retry override outside the scheduler', async () => {
    const target = provider({ apiKey: 'fixture-key', maxRetries: 2 });
    const client = Reflect.get(target, 'createScopedClient').call(target) as OpenAI;
    vi.mocked(fetchWithProxy).mockResolvedValue(
      Response.json(
        { error: { message: 'fixture transient' } },
        { status: 503, headers: { 'retry-after-ms': '0' } },
      ),
    );
    await expect(
      client.responses.create({ model: 'fixture', input: 'hello' }, { maxRetries: 0 }),
    ).rejects.toThrow('fixture transient');
    expect(fetchWithProxy).toHaveBeenCalledOnce();
  });

  it('requires credentials for a separate authenticated session endpoint', async () => {
    await expect(
      provider({
        apiKey: 'model-key',
        session: {
          type: 'openai-conversations',
          conversationId: 'conv_fixture',
          baseURL: 'https://session.example.invalid/v1',
        },
      }).callApi('hello'),
    ).rejects.toThrow(/Missing credentials/);
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('does not share model keyless mode with a separate session endpoint', async () => {
    await expect(
      provider({
        apiKeyRequired: false,
        session: {
          type: 'openai-conversations',
          conversationId: 'conv_fixture',
          baseURL: 'https://session.example.invalid/v1',
        },
      }).callApi('hello'),
    ).rejects.toThrow('Missing credentials');
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it.each(['env', 'config'])('preserves an empty %s organization mask', async (source) => {
    await cliState.withEnv({ OPENAI_ORGANIZATION: 'ambient-org' }, () =>
      provider(
        source === 'config' ? { organization: '' } : {},
        source === 'env' ? { OPENAI_ORGANIZATION: '' } : {},
      ).callApi('hello'),
    );
    expect(request().headers.get('openai-organization')).toBeNull();
  });

  it.each([false, true])(
    'keeps cached session retry policy current with scheduler disabled=%s',
    async (disabled) => {
      await cliState.withEnv(
        { PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: String(disabled) },
        async () => {
          const registry = new RateLimitRegistry({ maxConcurrency: 1 });
          const target = provider({
            apiKey: 'fixture-key',
            session: { type: 'openai-conversations', conversationId: 'conv_fixture' },
          });
          let fail = false;
          vi.mocked(fetchWithProxy).mockImplementation(async (input) => {
            if (fail) {
              return Response.json(
                { error: { message: 'fixture terminal', type: 'invalid_request_error' } },
                { status: 409, headers: { 'retry-after-ms': '0' } },
              );
            }
            return String(input).includes('/items')
              ? Response.json({ data: [], object: 'list', has_more: false })
              : Response.json(response);
          });
          try {
            // Create the cached session under a direct call, then reuse it in both contexts.
            await target.callApi('hello');
            fail = true;
            for (const managed of [true, false, true]) {
              vi.mocked(fetchWithProxy).mockClear();
              const invoke = () => target.callApi('hello');
              await expect(
                managed
                  ? registry.execute(target, invoke, { isRateLimited: () => false })
                  : invoke(),
              ).rejects.toThrow('fixture terminal');
              expect(fetchWithProxy).toHaveBeenCalledTimes(managed && !disabled ? 1 : 3);
            }
          } finally {
            registry.dispose();
          }
        },
      );
    },
  );

  it('rejects an explicitly masked key instead of using host credentials', async () => {
    await expect(provider({}, { OPENAI_API_KEY: '' }).callApi('hello')).rejects.toThrow(
      /Missing credentials/,
    );
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });
});
