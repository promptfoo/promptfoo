import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  Agent,
  type Model,
  OpenAIProvider,
  setDefaultModelProvider,
  setTracingDisabled,
  tool,
  Usage,
} from '@openai/agents';
import OpenAI from 'openai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import cliState from '../../../src/cliState';
import { getEnvString } from '../../../src/envars';
import { loadApiProvider } from '../../../src/providers/index';
import { OpenAiAgentsProvider } from '../../../src/providers/openai/agents';
import { RateLimitRegistry } from '../../../src/scheduler/rateLimitRegistry';
import { CreateJobRequestSchema } from '../../../src/types/api/eval';
import { getProviderFromCloud } from '../../../src/util/cloud';
import { fetchWithProxy } from '../../../src/util/fetch/index';
import { getProxyForUrl } from '../../../src/util/fetch/proxy';
import { clearProxyEnv, createDeferred, mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));
vi.mock('../../../src/util/cloud', async (importOriginal) => ({
  ...(await importOriginal()),
  getProviderFromCloud: vi.fn(),
}));
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
    REQUEST_TIMEOUT_MS: undefined,
    PROMPTFOO_CA_CERT_PATH: undefined,
    PROMPTFOO_INSECURE_SSL: undefined,
    PROMPTFOO_FETCH_CONNECTIONS: undefined,
  });
  vi.mocked(fetchWithProxy).mockImplementation(async () => Response.json(response));
});
afterEach(() => {
  restoreEnv();
  vi.unstubAllGlobals();
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

  it.each(
    (['suite', 'file', 'process'] as const).flatMap((scope) =>
      [
        ['OPENAI_API_HOST', 'gateway.example.invalid'],
        ['OPENAI_API_BASE_URL', 'https://gateway.example.invalid/v1'],
        ['OPENAI_BASE_URL', 'https://gateway.example.invalid/v1'],
      ].map(([name, value]) => ({ scope, name, value })),
    ),
  )('honors call-time $scope $name on an unbound provider', async ({ scope, name, value }) => {
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    vi.spyOn(custom, 'getModel').mockRejectedValue(new Error('default provider bypassed gateway'));
    setDefaultModelProvider(custom);
    const target = provider();
    const invoke = () => target.callApi('hello');
    if (scope === 'process') {
      mockProcessEnv({ [name]: value });
      await invoke();
    } else if (scope === 'suite') {
      await cliState.withEnv({ [name]: value }, invoke);
    } else {
      await cliState.withEnvFileOverrides({ [name]: value }, invoke);
    }
    expect(request().url).toBe('https://gateway.example.invalid/v1/responses');
    expect(request().headers.get('authorization')).toBe('Bearer host-key');
  });

  it.each(['host-org', ''])('honors a process-only organization of %j', async (organization) => {
    mockProcessEnv({ OPENAI_ORGANIZATION: organization, OPENAI_ORG_ID: 'sdk-org' });
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    vi.spyOn(custom, 'getModel').mockRejectedValue(
      new Error('default provider bypassed organization'),
    );
    setDefaultModelProvider(custom);
    await provider().callApi('hello');
    expect(request().headers.get('openai-organization')).toBe(organization || null);
  });

  it.each(
    [
      ['REQUEST_TIMEOUT_MS', '1234'],
      ['PROMPTFOO_FETCH_CONNECTIONS', '2'],
    ].flatMap(([name, value]) => [
      { name, value },
      { name, value: '' },
    ]),
  )('honors validated job $name=$value', async ({ name, value }) => {
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    vi.spyOn(custom, 'getModel').mockRejectedValue(new Error('validated setting was stripped'));
    setDefaultModelProvider(custom);
    vi.mocked(fetchWithProxy).mockImplementation(async () => {
      expect(getEnvString(name)).toBe(value);
      return Response.json(response);
    });
    const { env } = CreateJobRequestSchema.parse({
      env: { [name]: value },
      providers: ['echo'],
      prompts: ['hello'],
    });
    const result = await cliState.withEnv(env, () => provider().callApi('hello'));
    expect(result.output).toBe('ok');
    expect(fetchWithProxy).toHaveBeenCalledOnce();
  });

  it.each(['suite', 'file'] as const)(
    'uses the shared transport for a %s-only proxy setting',
    async (scope) => {
      const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
      vi.spyOn(custom, 'getModel').mockRejectedValue(new Error('default provider bypassed proxy'));
      setDefaultModelProvider(custom);
      const invoke = () => provider().callApi('hello');
      await (scope === 'suite'
        ? cliState.withEnv({ HTTPS_PROXY: 'http://127.0.0.1:19191' }, invoke)
        : cliState.withEnvFileOverrides({ no_proxy: '*' }, invoke));
      expect(fetchWithProxy).toHaveBeenCalledOnce();
      expect(request().url).toBe('https://api.openai.com/v1/responses');
    },
  );

  it.each(
    (['provider', 'suite', 'file', 'process'] as const).flatMap((scope) =>
      [
        ['REQUEST_TIMEOUT_MS', '1234'],
        ['PROMPTFOO_CA_CERT_PATH', '/fixture/ca.pem'],
        ['PROMPTFOO_INSECURE_SSL', 'false'],
        ['PROMPTFOO_FETCH_CONNECTIONS', '2'],
      ].flatMap(([name, value]) => [
        { scope, name, value },
        { scope, name, value: '' },
      ]),
    ),
  )('uses the shared transport for $scope $name=$value', async ({ scope, name, value }) => {
    mockProcessEnv({ [name]: scope === 'process' ? value : 'host-setting' });
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    vi.spyOn(custom, 'getModel').mockRejectedValue(
      new Error('default provider bypassed transport'),
    );
    setDefaultModelProvider(custom);
    vi.mocked(fetchWithProxy).mockImplementation(async () => {
      expect(getEnvString(name)).toBe(value);
      expect(getEnvString('AGENTS_FIXTURE_PRESERVED')).toBe('suite-setting');
      return Response.json(response);
    });
    const invoke = () =>
      provider({}, scope === 'provider' ? { [name]: value } : {}).callApi('hello');
    const suiteEnv = {
      AGENTS_FIXTURE_PRESERVED: 'suite-setting',
      ...(scope === 'provider' && { [name]: 'suite-setting' }),
      ...(scope === 'suite' && { [name]: value }),
    };
    const result = await cliState.withEnvFileOverrides(
      scope === 'file' ? { [name]: value } : undefined,
      () => cliState.withEnv(suiteEnv, invoke),
    );
    expect(getEnvString(name)).toBe(scope === 'process' ? value : 'host-setting');
    expect(result.output).toBe('ok');
    expect(fetchWithProxy).toHaveBeenCalledOnce();
    expect(request().url).toBe('https://api.openai.com/v1/responses');
  });

  it.each(['suite', 'file'] as const)(
    'preserves the SDK default provider for unrelated %s settings',
    async (scope) => {
      const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
      const getModel = vi
        .spyOn(custom, 'getModel')
        .mockRejectedValue(new Error('custom model selected'));
      setDefaultModelProvider(custom);
      const invoke = () => provider().callApi('hello');
      await expect(
        scope === 'suite'
          ? cliState.withEnv({ PROMPTFOO_DISABLE_TELEMETRY: 'true' }, invoke)
          : cliState.withEnvFileOverrides({ PROMPTFOO_DISABLE_TELEMETRY: 'true' }, invoke),
      ).rejects.toThrow('custom model selected');
      expect(getModel).toHaveBeenCalledOnce();
      expect(fetchWithProxy).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1])(
    'applies a retry budget of %s without other connection settings',
    async (maxRetries) => {
      const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
      vi.spyOn(custom, 'getModel').mockRejectedValue(
        new Error('default provider bypassed retries'),
      );
      setDefaultModelProvider(custom);
      vi.mocked(fetchWithProxy).mockResolvedValue(
        Response.json({ error: 'retry fixture' }, { status: 409 }),
      );

      await expect(provider({ maxRetries }).callApi('hello')).rejects.toThrow('409');
      expect(fetchWithProxy).toHaveBeenCalledOnce();
    },
  );

  it('uses explicit connection config ahead of scoped values', async () => {
    await cliState.withEnv({ OPENAI_API_KEY: 'suite-key' }, () =>
      provider({ apiKey: 'config-key', apiBaseUrl: 'https://config.example/v1' }).callApi('hello'),
    );
    expect(request().headers.get('authorization')).toBe('Bearer config-key');
    expect(request().url).toBe('https://config.example/v1/responses');
  });

  it.each(
    (['explicit', 'ambient'] as const).flatMap((loading) =>
      [false, true].map((providerOverride) => ({ loading, providerOverride })),
    ),
  )(
    'retains $loading load-time settings (provider override=$providerOverride)',
    async ({ loading, providerOverride }) => {
      const loadedEnv = {
        OPENAI_API_KEY: 'loaded-key',
        OPENAI_BASE_URL: 'https://loaded.example/v1',
        OPENAI_ORGANIZATION: 'loaded-org',
      };
      const providerEnv = {
        OPENAI_API_KEY: 'provider-key',
        OPENAI_BASE_URL: 'https://provider.example/v1',
        OPENAI_ORGANIZATION: 'provider-org',
      };
      const options = {
        config: { agent: new Agent({ name: 'fixture', model: 'gpt-4.1-mini' }) },
        env: providerOverride ? providerEnv : undefined,
      };
      const target = await (loading === 'explicit'
        ? loadApiProvider('openai:agents:fixture', { env: loadedEnv, options })
        : cliState.withEnv(loadedEnv, () => loadApiProvider('openai:agents:fixture', { options })));
      await cliState.withEnv(
        {
          OPENAI_API_KEY: 'active-key',
          OPENAI_API_HOST: 'active.example',
          OPENAI_ORGANIZATION: 'active-org',
        },
        () => target.callApi('hello'),
      );
      const expected = providerOverride ? providerEnv : loadedEnv;
      expect(request().url).toBe(`${expected.OPENAI_BASE_URL}/responses`);
      expect(request().headers.get('authorization')).toBe(`Bearer ${expected.OPENAI_API_KEY}`);
      expect(request().headers.get('openai-organization')).toBe(expected.OPENAI_ORGANIZATION);
    },
  );

  it.each(
    (['explicit', 'ambient'] as const).flatMap((loading) =>
      [
        { env: { NO_PROXY: '*' }, active: undefined, expected: '' },
        {
          env: { HTTPS_PROXY: 'http://loaded.example:8080' },
          active: { https_proxy: 'http://active.example:8080' },
          expected: 'http://loaded.example:8080',
        },
        {
          env: { https_proxy: '' },
          active: { HTTPS_PROXY: 'http://active.example:8080' },
          expected: '',
        },
        {
          env: { HTTPS_PROXY: '' },
          active: { https_proxy: 'http://active.example:8080' },
          expected: '',
        },
        {
          env: {
            HTTPS_PROXY: 'http://upper.example:8080',
            https_proxy: 'http://lower.example:8080',
          },
          active: undefined,
          expected: 'http://lower.example:8080',
        },
        { env: { NO_PROXY: '' }, active: { no_proxy: '*' }, expected: 'http://host.example:8080' },
        {
          env: { NO_PROXY: 'other.example' },
          active: { https_proxy: 'http://active.example:8080' },
          expected: 'http://active.example:8080',
        },
      ].map((testCase) => ({ loading, ...testCase })),
    ),
  )('retains $loading loaded proxy policy $env', async ({ loading, env, active, expected }) => {
    clearProxyEnv();
    mockProcessEnv({ HTTPS_PROXY: 'http://host.example:8080' });
    const custom = new OpenAIProvider({ apiKey: 'sdk-key' });
    vi.spyOn(custom, 'getModel').mockRejectedValue(new Error('loaded proxy policy was ignored'));
    setDefaultModelProvider(custom);
    vi.mocked(fetchWithProxy).mockImplementation(async () => {
      expect(getProxyForUrl('https://api.openai.com/v1/responses')).toBe(expected);
      return Response.json(response);
    });
    const options = { config: { agent: new Agent({ name: 'fixture', model: 'gpt-4.1-mini' }) } };
    const target = await (loading === 'explicit'
      ? loadApiProvider('openai:agents:fixture', { env, options })
      : cliState.withEnv(env, () => loadApiProvider('openai:agents:fixture', { options })));
    const result = await cliState.withEnv(active, () => target.callApi('hello'));
    expect(result.output).toBe('ok');
    expect(fetchWithProxy).toHaveBeenCalledOnce();
    expect(request().headers.get('authorization')).toBe('Bearer host-key');
  });

  it.each([
    {
      env: { HTTPS_PROXY: 'http://provider.example:8080' },
      expected: 'http://provider.example:8080',
    },
    { env: { HTTPS_PROXY: '' }, expected: '' },
    { env: { HTTPS_PROXY: undefined }, expected: 'http://suite.example:8080' },
    {
      env: { HTTPS_PROXY: 'http://upper.example:8080', https_proxy: 'http://lower.example:8080' },
      expected: 'http://lower.example:8080',
    },
    { env: { HTTPS_PROXY: 'http://upper.example:8080', https_proxy: '' }, expected: '' },
    { env: { NO_PROXY: '*' }, expected: '' },
  ])('merges provider proxy aliases before retained capture: $env', async ({ env, expected }) => {
    clearProxyEnv();
    vi.mocked(fetchWithProxy).mockImplementation(async () => {
      expect(getProxyForUrl('https://api.openai.com/v1/responses')).toBe(expected);
      return Response.json(response);
    });
    const target = await loadApiProvider('openai:agents:fixture', {
      env: { https_proxy: 'http://suite.example:8080', no_proxy: '' },
      options: {
        env,
        config: {
          agent: { name: 'fixture', model: 'gpt-4.1-mini' },
          headers: { 'x-explicit-template': '{{env.https_proxy}}' },
        },
      },
    });
    expect((await target.callApi('hello')).output).toBe('ok');
    expect(request().headers.get('x-explicit-template')).toBe(
      env.https_proxy ?? 'http://suite.example:8080',
    );
  });

  it.each(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'] as const)(
    'retains a provider %s empty mask over a suite lowercase alias',
    async (key) => {
      clearProxyEnv();
      const url =
        key === 'HTTP_PROXY'
          ? 'http://fixture.example/v1/responses'
          : 'https://api.openai.com/v1/responses';
      vi.mocked(fetchWithProxy).mockImplementation(async () => {
        expect(getProxyForUrl(url)).toBe(key === 'NO_PROXY' ? 'http://host.example:8080' : '');
        return Response.json(response);
      });
      const target = await loadApiProvider('openai:agents', {
        env: {
          ...(key === 'NO_PROXY' && { HTTPS_PROXY: 'http://host.example:8080' }),
          [key.toLowerCase()]: key === 'NO_PROXY' ? '*' : 'http://suite.example:8080',
        },
        options: {
          env: { [key]: '' },
          config: { agent: { name: 'fixture', model: 'gpt-4.1-mini' } },
        },
      });
      expect((await target.callApi('hello')).output).toBe('ok');
    },
  );

  it.each(
    ['http://provider.example:8080', ''].flatMap((value) =>
      ['file', 'nested file', 'cloud'].map((wrapperType) => ({ value, wrapperType })),
    ),
  )(
    'preserves provider proxy priority through a $wrapperType wrapper (value=$value)',
    async ({ value, wrapperType }) => {
      clearProxyEnv();
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-agents-proxy-'));
      const filename = path.join(directory, 'provider.json');
      try {
        fs.writeFileSync(
          filename,
          JSON.stringify({
            id: 'openai:agents:fixture',
            config: { agent: { name: 'fixture', model: 'gpt-4.1-mini' } },
          }),
        );
        const wrapper = path.join(directory, 'wrapper.json');
        if (wrapperType === 'nested file') {
          fs.writeFileSync(
            wrapper,
            JSON.stringify({ id: '{{env.AGENTS_PROXY_FIXTURE_PROVIDER}}' }),
          );
        }
        vi.mocked(fetchWithProxy).mockImplementation(async () => {
          expect(getProxyForUrl('https://api.openai.com/v1/responses')).toBe(value);
          return Response.json(response);
        });
        vi.mocked(getProviderFromCloud).mockResolvedValue({
          id: `file://${filename}`,
          env: { https_proxy: 'http://cloud-default.example:8080' },
        });
        const reference =
          wrapperType === 'cloud'
            ? 'promptfoo://provider/12345678-1234-1234-1234-123456789abc'
            : `file://${wrapperType === 'nested file' ? wrapper : filename}`;
        const target = await loadApiProvider(reference, {
          env: {
            https_proxy: 'http://suite.example:8080',
            AGENTS_PROXY_FIXTURE_PROVIDER: `file://${filename}`,
          },
          options: { env: { HTTPS_PROXY: value } },
        });
        expect((await target.callApi('hello')).output).toBe('ok');
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

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

  it.each([
    { headers: { 'X-Gateway-Auth': 'fixture' } },
    { apiBaseUrl: 'https://gateway.example.invalid/v1?api-key=fixture' },
    { apiKeyRequired: false },
  ])('keeps the ambient key off an independently authenticated gateway: %j', async (config) => {
    await provider({ apiBaseUrl: 'https://gateway.example.invalid/v1', ...config }).callApi(
      'hello',
    );
    expect(request().headers.has('authorization')).toBe(false);
  });

  it.each([{ apiKey: 'explicit-key' }, { apiKeyEnvar: 'OPENAI_API_KEY' }])(
    'keeps explicitly selected gateway API keys: %j',
    async (config) => {
      await provider({
        apiBaseUrl: 'https://gateway.example.invalid/v1',
        apiKeyRequired: false,
        headers: { 'X-Gateway-Auth': 'fixture' },
        ...config,
      }).callApi('hello');
      expect(request().headers.get('authorization')).toBe(
        `Bearer ${'apiKey' in config ? config.apiKey : 'host-key'}`,
      );
    },
  );

  it('keeps ambient authentication for the OpenAI API', async () => {
    await provider({ headers: { 'X-Gateway-Auth': 'fixture' } }).callApi('hello');
    expect(request().headers.get('authorization')).toBe('Bearer host-key');
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

  it.each([
    'https://fixture.example.invalid/v1?api-key=model-gateway-secret',
    'https://model-user:model-password@fixture.example.invalid/v1',
    'https://fixture.example.invalid/key_modelcredential/v1',
  ])(
    'requires a session endpoint when a separate key would inherit URL credentials: %s',
    async (apiBaseUrl) => {
      vi.mocked(fetchWithProxy).mockImplementation(async (input) =>
        String(input).includes('/items')
          ? Response.json({ data: [], object: 'list', has_more: false })
          : Response.json(response),
      );
      await expect(
        provider({
          apiBaseUrl,
          apiKey: 'model-key',
          session: {
            type: 'openai-conversations',
            conversationId: 'conv_fixture',
            apiKey: 'session-key',
          },
        }).callApi('hello'),
      ).rejects.toThrow('session.baseURL');
      expect(fetchWithProxy).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      modelURL:
        'https://fixture.example.invalid/v1?route=fixture&scope=read&scope=write&label=a%20b',
      sessionURL: undefined,
    },
    {
      modelURL: 'https://fixture.example.invalid/v1?api-key=model-secret',
      sessionURL: 'https://session.example.invalid/v1?api-key=session-secret',
    },
  ])(
    'preserves deliberately configured session routing for $sessionURL',
    async ({ modelURL, sessionURL }) => {
      vi.mocked(fetchWithProxy).mockImplementation(async (input) =>
        String(input).includes('/items')
          ? Response.json({ data: [], object: 'list', has_more: false })
          : Response.json(response),
      );
      await provider({
        apiBaseUrl: modelURL,
        apiKey: 'model-key',
        session: {
          type: 'openai-conversations',
          conversationId: 'conv_fixture',
          apiKey: 'session-key',
          baseURL: sessionURL,
        },
      }).callApi('hello');
      const calls = vi.mocked(fetchWithProxy).mock.calls;
      expect(calls.some(([input]) => String(input).includes('/items'))).toBe(true);
      for (const [input, options] of calls) {
        const actual = new URL(String(input));
        const session = actual.pathname.includes('/items');
        const expected = new URL(session ? (sessionURL ?? modelURL) : modelURL);
        expect(actual.origin).toBe(expected.origin);
        expect(actual.search.slice(0, expected.search.length)).toBe(expected.search);
        expect(new Headers(options?.headers).get('authorization')).toBe(
          `Bearer ${session ? 'session-key' : 'model-key'}`,
        );
      }
    },
  );

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

  it.each([
    [{ organization: 'session-org' }, 'session-org', 'model-header-project'],
    [{ project: 'session-project' }, 'model-header-org', 'session-project'],
    [{ organization: '', project: '' }, null, null],
  ] as const)(
    'preserves gateway headers for metadata-only session settings %j',
    async (metadata, organization, project) => {
      const calls: { session: boolean; headers: Headers }[] = [];
      vi.mocked(fetchWithProxy).mockImplementation(async (input, options) => {
        const session = String(input).includes('/items');
        calls.push({ session, headers: new Headers(options?.headers) });
        return session
          ? Response.json({ data: [], object: 'list', has_more: false })
          : Response.json(response);
      });
      await provider({
        apiKey: 'model-key',
        headers: {
          'X-Gateway-Auth': 'fixture',
          'openai-organization': 'model-header-org',
          'OPENAI-PROJECT': 'model-header-project',
        },
        session: { type: 'openai-conversations', conversationId: 'conv_fixture', ...metadata },
      }).callApi('hello');
      expect(calls.some((call) => call.session)).toBe(true);
      for (const call of calls) {
        expect(call.headers.get('x-gateway-auth')).toBe('fixture');
        expect(call.headers.get('authorization')).toBe('Bearer model-key');
        expect(call.headers.get('openai-organization')).toBe(
          call.session ? organization : 'model-header-org',
        );
        expect(call.headers.get('openai-project')).toBe(
          call.session ? project : 'model-header-project',
        );
      }
    },
  );

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

  it('isolates metadata when a session supplies only its own key', async () => {
    mockProcessEnv({ OPENAI_PROJECT_ID: 'host-project', OPENAI_ORGANIZATION: 'host-org' });
    const calls: { url: string; headers: Headers }[] = [];
    vi.mocked(fetchWithProxy).mockImplementation(async (input, options) => {
      calls.push({ url: String(input), headers: new Headers(options?.headers) });
      return String(input).includes('/items')
        ? Response.json({ data: [], object: 'list', has_more: false })
        : Response.json(response);
    });
    await provider({
      apiKey: 'model-key',
      organization: 'model-org',
      session: {
        type: 'openai-conversations',
        conversationId: 'conv_fixture',
        apiKey: 'session-key',
      },
    }).callApi('hello');
    const headers = calls.find((call) => call.url.includes('/items'))!.headers;
    expect(headers.get('authorization')).toBe('Bearer session-key');
    expect(headers.get('openai-organization')).toBeNull();
    expect(headers.get('openai-project')).toBeNull();
    expect(
      calls.find((call) => call.url.endsWith('/responses'))!.headers.get('openai-organization'),
    ).toBe('model-org');
  });

  it('routes session-only settings through Promptfoo without replacing the default model', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unscoped session request')));
    const custom = new OpenAIProvider({ apiKey: 'sdk-model-key' });
    const getResponse = vi.fn(async () => ({
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'custom model' }],
        },
      ],
      usage: new Usage(),
      responseId: 'resp_custom',
    }));
    vi.spyOn(custom, 'getModel').mockResolvedValue({
      getResponse,
      getStreamedResponse: vi.fn(),
    } as unknown as Model);
    setDefaultModelProvider(custom);
    vi.mocked(fetchWithProxy).mockImplementation(async () =>
      Response.json({ data: [], object: 'list', has_more: false }),
    );
    const result = await provider({
      session: {
        type: 'openai-conversations',
        conversationId: 'conv_fixture',
        apiKey: 'session-key',
        baseURL: 'https://session.example.invalid/v1',
      },
    }).callApi('hello');
    expect(result.output).toBe('custom model');
    expect(getResponse).toHaveBeenCalledOnce();
    expect(fetchWithProxy).toHaveBeenCalled();
    for (const [url, options] of vi.mocked(fetchWithProxy).mock.calls) {
      expect(String(url)).toContain('https://session.example.invalid/v1/conversations/');
      expect(new Headers(options?.headers).get('authorization')).toBe('Bearer session-key');
    }
    vi.unstubAllGlobals();
  });

  it('retries a failed model request without replaying completed tool work', async () => {
    const execute = vi.fn(async () => 'recorded');
    const agent = new Agent({
      name: 'fixture',
      model: 'gpt-4.1-mini',
      tools: [
        tool({
          name: 'record',
          description: 'Record a fixture counter',
          parameters: z.object({}),
          execute,
        }),
      ],
    });
    const target = provider({ agent, apiKey: 'fixture-key', maxRetries: 1 });
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    vi.mocked(fetchWithProxy).mockImplementation(async (_input, options) => {
      const body = JSON.parse(options?.body as string);
      const hasToolResult = body.input.some(
        (item: { type: string }) => item.type === 'function_call_output',
      );
      return hasToolResult
        ? Response.json(
            { error: { message: 'fixture transient' } },
            { status: 503, headers: { 'retry-after-ms': '1' } },
          )
        : Response.json({
            ...response,
            output: [
              {
                type: 'function_call',
                id: 'fc_fixture',
                call_id: 'call_fixture',
                name: 'record',
                arguments: '{}',
                status: 'completed',
              },
            ],
          });
    });
    try {
      await expect(
        registry.execute(target, () => target.callApi('hello'), {
          isRateLimited: (_result, error) => !!error,
          getRetryAfter: () => 1,
        }),
      ).rejects.toThrow('fixture transient');
      expect(execute).toHaveBeenCalledOnce();
      expect(fetchWithProxy).toHaveBeenCalledTimes(3);
    } finally {
      registry.dispose();
    }
  });

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

  it.each([
    'https://session.example.invalid/v1?api-key=fixture',
    'https://session.example.invalid/key_fixturecredential/v1',
  ])('uses credentials from the session URL itself: %s', async (baseURL) => {
    const calls: { url: string; authorization: string | null }[] = [];
    vi.mocked(fetchWithProxy).mockImplementation(async (input, options) => {
      calls.push({
        url: String(input),
        authorization: new Headers(options?.headers).get('authorization'),
      });
      return String(input).includes('/items')
        ? Response.json({ data: [], object: 'list', has_more: false })
        : Response.json(response);
    });
    await provider({
      apiKey: 'model-key',
      session: { type: 'openai-conversations', conversationId: 'conv_fixture', baseURL },
    }).callApi('hello');
    const sessionCalls = calls.filter((call) => call.url.includes('/items'));
    expect(sessionCalls.length).toBeGreaterThan(0);
    for (const call of sessionCalls) {
      expect(call.authorization).toBeNull();
      expect(new URL(call.url).searchParams.get('api-key')).toBe(
        new URL(baseURL).searchParams.get('api-key'),
      );
      expect(new URL(call.url).pathname.startsWith(new URL(baseURL).pathname)).toBe(true);
    }
    expect(calls.find((call) => call.url.endsWith('/responses'))?.authorization).toBe(
      'Bearer model-key',
    );
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
    'retries cached session requests individually with scheduler disabled=%s',
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
              expect(fetchWithProxy).toHaveBeenCalledTimes(3);
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
