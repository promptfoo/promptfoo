import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiAgentsApiProvider } from '../../../src/providers/openai/agents-api';
import { withGenAISpan } from '../../../src/providers/tracing';
import { fetchWithRetries } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: vi.fn(),
}));

vi.mock('../../../src/providers/tracing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/providers/tracing')>();
  return { ...actual, withGenAISpan: vi.fn(actual.withGenAISpan) };
});

const usage = {
  input_tokens: 100,
  output_tokens: 20,
  total_tokens: 120,
  input_tokens_details: { cached_tokens: 40 },
  output_tokens_details: { reasoning_tokens: 5 },
};
const session = { id: 'sess_test', status: 'idle', agent: { model: 'gpt-6-astra' }, usage };
const turn = { id: 'turn_test', status: 'completed', subagent_id: null, usage };
const message = {
  id: 'msg_final',
  type: 'message',
  role: 'assistant',
  phase: 'final_answer',
  status: 'completed',
  turn_id: turn.id,
  content: [{ type: 'output_text', text: '42' }],
};
const page = (data: unknown[], more = false, lastId: string | null = null) => ({
  data,
  has_more: more,
  last_id: lastId,
});
const json = (data: unknown) => new Response(JSON.stringify(data));
const apiError = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), { status });

function defaultResponse(pathname: string, method?: string) {
  if (method === 'DELETE') {
    return json({ deleted: true });
  }
  if (pathname.endsWith('/turns/turn_test')) {
    return json(turn);
  }
  if (pathname.endsWith('/turns')) {
    return json(page([turn]));
  }
  if (pathname.endsWith('/subagents')) {
    return json(page([]));
  }
  if (pathname.endsWith('/items')) {
    return json(page([message]));
  }
  return json(session);
}

/** Override selected API routes; unmatched requests use the default successful session. */
function mockApi(route: (pathname: string, method: string) => Response | undefined) {
  vi.mocked(fetchWithRetries).mockImplementation(async (url, options) => {
    const pathname = new URL(String(url)).pathname;
    const method = options?.method ?? 'GET';
    return route(pathname, method) ?? defaultResponse(pathname, method);
  });
}

const calls = () =>
  vi.mocked(fetchWithRetries).mock.calls.map(([url, options]) => ({
    pathname: new URL(String(url)).pathname,
    method: options?.method ?? 'GET',
    options,
  }));

const withoutUsage = (pathname: string, method: string) => {
  if (method === 'DELETE') {
    return undefined;
  }
  if (pathname.endsWith('/turns/turn_test')) {
    return json({ ...turn, usage: null });
  }
  if (pathname.endsWith('/turns')) {
    return json(page([{ ...turn, usage: null }]));
  }
  return pathname.endsWith('/sess_test') || pathname.endsWith('/sessions')
    ? json({ ...session, usage: null })
    : undefined;
};

describe('OpenAiAgentsApiProvider', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    // Endpoint and organization overrides from the outer shell would change URLs and headers.
    restoreEnv = mockProcessEnv({
      OPENAI_API_KEY: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_ORGANIZATION: undefined,
    });
    vi.mocked(fetchWithRetries).mockReset();
    vi.mocked(fetchWithRetries).mockImplementation(async (url, options) =>
      defaultResponse(new URL(String(url)).pathname, options?.method),
    );
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function provider(
    config: NonNullable<ConstructorParameters<typeof OpenAiAgentsApiProvider>[1]>['config'] = {},
  ) {
    return new OpenAiAgentsApiProvider('', { config: { apiKey: 'test-key', ...config } });
  }

  it('creates an isolated session, reads its final answer and usage, and deletes it', async () => {
    const result = await provider().callApi('Compute six times seven');
    expect(result).toMatchObject({
      output: '42',
      cached: false,
      tokenUsage: {
        prompt: 100,
        completion: 20,
        total: 120,
        cached: 40,
        completionDetails: { reasoning: 5 },
      },
      metadata: { sessionId: session.id, turnId: turn.id, sessionDeleted: true },
    });
    expect(result.cost).toBeGreaterThan(0);
    const [url, request, , retries] = vi.mocked(fetchWithRetries).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/agents/sessions');
    expect(JSON.parse(request!.body as string)).toEqual({
      agent: { model: 'gpt-6-astra' },
      environment: { type: 'none' },
      input: 'Compute six times seven',
      stream: false,
    });
    expect(new Headers(request!.headers).get('OpenAI-Beta')).toBe('agents=v1');
    expect(new Headers(request!.headers).get('Authorization')).toBe('Bearer test-key');
    expect(retries).toBe(0);
    expect(vi.mocked(fetchWithRetries).mock.calls.at(-1)?.[1]?.method).toBe('DELETE');
  });

  it('preserves saved-agent configuration without injecting a default model', async () => {
    const agentProvider = provider({
      agent_id: 'agent_saved',
      agent: { instructions: 'Be concise' },
      environment: { type: 'openai_hosted', network: { access: 'disabled' } },
      vault_ids: ['vault_test'],
      metadata: { purpose: 'eval' },
    });
    expect(agentProvider.id()).toBe('openai:agents-api');
    await agentProvider.callApi('Hello');
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      agent_id: 'agent_saved',
      agent: { instructions: 'Be concise' },
      environment: { type: 'openai_hosted', network: { access: 'disabled' } },
      vault_ids: ['vault_test'],
      metadata: { purpose: 'eval' },
    });
    expect(
      JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).agent,
    ).not.toHaveProperty('model');
  });

  it('uses the model suffix before agent.model and preserves custom IDs', () => {
    const agentProvider = new OpenAiAgentsApiProvider('gpt-5.6', {
      id: 'my-agent',
      config: { agent: { model: 'gpt-6-astra' } },
    });
    expect(agentProvider.id()).toBe('my-agent');
    expect(agentProvider.modelName).toBe('gpt-5.6');
  });

  it('attributes invoke_agent spans to the configured provider and saved agent', async () => {
    vi.mocked(withGenAISpan).mockClear();
    const agentProvider = new OpenAiAgentsApiProvider('', {
      id: 'hosted-agent',
      config: { apiKey: 'test-key', agent_id: 'agent_saved' },
    });
    const result = await agentProvider.callApi('hi');
    const [spanContext, , extractAttributes] = vi.mocked(withGenAISpan).mock.calls[0];
    expect(spanContext).toMatchObject({
      operationName: 'invoke_agent',
      providerId: 'hosted-agent',
      agentId: 'agent_saved',
    });
    expect(extractAttributes?.(result)).toMatchObject({ responseModel: 'gpt-6-astra' });
  });

  it('fails before making requests when credentials are absent', async () => {
    expect(await new OpenAiAgentsApiProvider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('OPENAI_API_KEY'),
    });
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('accepts a credential header for compatible gateways without an API key', async () => {
    const result = await new OpenAiAgentsApiProvider('', {
      config: {
        apiBaseUrl: 'https://gateway.example/v1',
        headers: { 'api-key': 'gateway-credential' },
      },
    }).callApi('hi');
    expect(result.output).toBe('42');
    const headers = new Headers(vi.mocked(fetchWithRetries).mock.calls[0][1]!.headers);
    expect(headers.get('api-key')).toBe('gateway-credential');
    expect(headers.has('Authorization')).toBe(false);
  });

  it('does not forward an ambient OpenAI key to a gateway with its own credential header', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key' });
    const authorizationHeaders = async (config: { apiBaseUrl?: string; apiKeyEnvar?: string }) => {
      vi.mocked(fetchWithRetries).mockClear();
      await new OpenAiAgentsApiProvider('', {
        config: { headers: { 'api-key': 'gateway-credential' }, ...config },
      }).callApi('hi');
      return vi
        .mocked(fetchWithRetries)
        .mock.calls.map(([, request]) => new Headers(request!.headers).get('Authorization'));
    };

    const gateway = await authorizationHeaders({ apiBaseUrl: 'https://gateway.example/v1' });
    expect(gateway.length).toBeGreaterThan(0);
    expect(gateway.every((value) => value === null)).toBe(true);
    // An explicit key source or the official API still receives the OpenAI key.
    expect(
      await authorizationHeaders({
        apiBaseUrl: 'https://gateway.example/v1',
        apiKeyEnvar: 'OPENAI_API_KEY',
      }),
    ).toContain('Bearer ambient-openai-key');
    expect(await authorizationHeaders({})).toContain('Bearer ambient-openai-key');
  });

  describe('URL-authenticated gateways', () => {
    const queryGatewayUrl = 'https://gateway.example/v1?api-key=gateway-query-secret';
    const userinfoGatewayUrl = 'https://gateway-user:gateway-password@gateway.example/v1';
    const authorizations = () =>
      vi
        .mocked(fetchWithRetries)
        .mock.calls.map(([, request]) => new Headers(request!.headers).get('Authorization'));
    const basic = (userinfo: string) => `Basic ${Buffer.from(userinfo).toString('base64')}`;
    // The fetch helper would Base64-encode URL userinfo while still escaped, so none may reach it.
    const noRequestUrlHasUserinfo = () =>
      vi
        .mocked(fetchWithRetries)
        .mock.calls.every(
          ([url]) => !new URL(String(url)).username && !new URL(String(url)).password,
        );

    it.each([
      {
        source: 'a query parameter',
        config: { apiBaseUrl: queryGatewayUrl },
        processEnv: {},
        authorization: null,
      },
      {
        source: 'userinfo',
        config: { apiBaseUrl: userinfoGatewayUrl },
        processEnv: {},
        authorization: basic('gateway-user:gateway-password'),
      },
      {
        source: 'username-only userinfo in apiHost',
        config: { apiHost: 'gateway-token-value@gateway.example' },
        processEnv: {},
        authorization: basic('gateway-token-value:'),
      },
      {
        source: 'an OPENAI_BASE_URL query parameter',
        config: {},
        processEnv: { OPENAI_BASE_URL: 'https://gateway.example/v1?key=gateway-query-secret' },
        authorization: null,
      },
      {
        source: 'OPENAI_API_HOST userinfo',
        config: {},
        processEnv: { OPENAI_API_HOST: 'gateway-user:gateway-password@gateway.example' },
        authorization: basic('gateway-user:gateway-password'),
      },
    ])(
      'never sends an ambient OpenAI key to a gateway authenticated by $source',
      async ({ config, processEnv, authorization }) => {
        mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key', ...processEnv });
        const gateway = new OpenAiAgentsApiProvider('', { config });
        expect((await gateway.callApi('hi')).output).toBe('42');
        // A failed turn also exercises cancellation before deletion.
        mockApi((pathname) =>
          pathname.endsWith('/turns')
            ? json(page([{ ...turn, status: 'failed', error: { message: 'stopped' } }]))
            : undefined,
        );
        expect(await gateway.callApi('hi')).toMatchObject({
          error: expect.stringContaining('turn failed: stopped'),
          metadata: { sessionCancelled: true, sessionDeleted: true },
        });
        expect(new Set(calls().map(({ method, pathname }) => `${method} ${pathname}`))).toEqual(
          new Set([
            'POST /v1/agents/sessions',
            'GET /v1/agents/sessions/sess_test/turns',
            'GET /v1/agents/sessions/sess_test',
            'GET /v1/agents/sessions/sess_test/items',
            'POST /v1/agents/sessions/sess_test/events',
            'DELETE /v1/agents/sessions/sess_test',
          ]),
        );
        // Only the gateway's own URL credential is sent, never the ambient key.
        expect(new Set(authorizations())).toEqual(new Set([authorization]));
        expect(noRequestUrlHasUserinfo()).toBe(true);
      },
    );

    it.each([
      { userinfo: 'us%40er:p%40ss%3Aword', decoded: 'us@er:p@ss:word' },
      // A malformed escape is kept as written, as Node's HTTP client does.
      { userinfo: 'gateway-user:bad%zz%40secret', decoded: 'gateway-user:bad%zz%40secret' },
    ])(
      'sends userinfo $userinfo as decoded Basic auth outside the request URL',
      async ({ userinfo, decoded }) => {
        mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key' });
        const result = await new OpenAiAgentsApiProvider('', {
          config: { apiBaseUrl: `https://${userinfo}@gateway.example/v1` },
        }).callApi('hi');
        expect(result.output).toBe('42');
        expect(new Set(authorizations())).toEqual(new Set([basic(decoded)]));
        expect(noRequestUrlHasUserinfo()).toBe(true);
      },
    );

    it('accepts a URL credential for a compatible gateway without an API key', async () => {
      const result = await new OpenAiAgentsApiProvider('', {
        config: { apiBaseUrl: queryGatewayUrl },
      }).callApi('hi');
      expect(result.output).toBe('42');
      for (const [url] of vi.mocked(fetchWithRetries).mock.calls) {
        expect(new URL(String(url)).searchParams.get('api-key')).toBe('gateway-query-secret');
      }
      expect(authorizations().every((value) => value === null)).toBe(true);
    });

    it.each([
      {
        description: 'the apiKeyEnvar key to a gateway',
        config: { apiBaseUrl: queryGatewayUrl, apiKeyEnvar: 'GATEWAY_OPENAI_KEY' },
        expected: 'Bearer explicit-gateway-key',
      },
      {
        description: 'an explicit apiKey to a gateway',
        config: { apiBaseUrl: userinfoGatewayUrl, apiKey: 'literal-gateway-key' },
        expected: 'Bearer literal-gateway-key',
      },
      {
        description: 'only the apiKeyEnvar key to a userinfo gateway',
        config: {
          apiBaseUrl: 'https://gateway-user:p%40ss@gateway.example/v1',
          apiKeyEnvar: 'GATEWAY_OPENAI_KEY',
        },
        expected: 'Bearer explicit-gateway-key',
      },
      {
        description: 'the ambient key to the official API',
        config: { apiBaseUrl: 'https://api.openai.com/v1?api-key=unused-query-value' },
        expected: 'Bearer ambient-openai-key',
      },
    ])('sends $description despite URL credentials', async ({ config, expected }) => {
      mockProcessEnv({
        OPENAI_API_KEY: 'ambient-openai-key',
        GATEWAY_OPENAI_KEY: 'explicit-gateway-key',
      });
      await new OpenAiAgentsApiProvider('', { config }).callApi('hi');
      const values = authorizations();
      expect(values.length).toBeGreaterThan(0);
      expect(values.every((value) => value === expected)).toBe(true);
      // Without userinfo in the URL, the fetch helper cannot append a second Basic credential.
      expect(noRequestUrlHasUserinfo()).toBe(true);
    });

    it('lets a configured Authorization header win over keys and URL userinfo', async () => {
      mockProcessEnv({
        OPENAI_API_KEY: 'ambient-openai-key',
        GATEWAY_OPENAI_KEY: 'explicit-gateway-key',
      });
      const result = await new OpenAiAgentsApiProvider('', {
        config: {
          apiBaseUrl: 'https://gateway-user:p%40ss@gateway.example/v1',
          apiKeyEnvar: 'GATEWAY_OPENAI_KEY',
          headers: { Authorization: 'Bearer configured-token' },
        },
      }).callApi('hi');
      expect(result.output).toBe('42');
      expect(new Set(authorizations())).toEqual(new Set(['Bearer configured-token']));
      expect(noRequestUrlHasUserinfo()).toBe(true);
    });

    it('redacts an echoed Basic token and decoded userinfo from errors', async () => {
      const decoded = 'gateway-user-name:p@ss:word-value';
      const token = Buffer.from(decoded).toString('base64');
      vi.mocked(fetchWithRetries).mockResolvedValueOnce(
        apiError(401, `Rejected ${token} with password p@ss:word-value for ${decoded}`),
      );
      const result = await new OpenAiAgentsApiProvider('', {
        config: { apiBaseUrl: 'https://gateway-user-name:p%40ss%3Aword-value@gateway.example/v1' },
      }).callApi('hi');
      expect(result.error).toContain('HTTP 401');
      for (const secret of [token, 'p@ss:word-value', decoded]) {
        expect(result.error).not.toContain(secret);
      }
    });
  });

  it('renders nested config once and preserves variable values as literal data', async () => {
    const agentProvider = provider({
      agent: { instructions: 'Follow {{role}}', tools: [{ server_label: '{{tool}}' }] },
      metadata: { purpose: '{{purpose}}' },
    });
    const result = await agentProvider.callApi('hi', {
      vars: { role: '{{ 6 * 7 }}', tool: 'docs', purpose: 'qa' },
      prompt: { raw: 'hi', label: 'test' },
    });
    expect(result.output).toBe('42');
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      agent: { instructions: 'Follow {{ 6 * 7 }}', tools: [{ server_label: 'docs' }] },
      metadata: { purpose: 'qa' },
    });
    expect(agentProvider.config.agent?.instructions).toBe('Follow {{role}}');
  });

  it('sends literal template braces unchanged unless they reference test variables', async () => {
    const setupCommands = [
      { command: "docker inspect -f '{{.State.Running}}' app" },
      { command: `python -c "print(f'{{name}}')"` },
      { command: 'echo "{{"answer": 42}}"' },
    ];
    await provider({
      agent: { instructions: 'Answer as {{role}}' },
      environment: { type: 'openai_hosted', setup_commands: setupCommands },
    }).callApi('hi', { vars: { role: 'a tester' }, prompt: { raw: 'hi', label: 'test' } });
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      agent: { instructions: 'Answer as a tester' },
      environment: { setup_commands: setupCommands },
    });
  });

  it('applies per-prompt config without injecting a default model into a saved agent', async () => {
    const attachedProviderMethod = vi.fn();
    const result = await provider().callApi('hi', {
      vars: { role: 'Be concise', saved: 'agent_prompt' },
      prompt: {
        raw: 'hi',
        label: 'test',
        config: {
          agent_id: '{{saved}}',
          agent: { instructions: '{{role}}' },
          environment: { type: 'openai_hosted' },
          retainSession: true,
          provider: { callApi: attachedProviderMethod },
        },
      },
    });
    expect(result.output).toBe('42');
    expect(JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string)).toMatchObject({
      agent_id: 'agent_prompt',
      agent: { instructions: 'Be concise' },
      environment: { type: 'openai_hosted' },
    });
    expect(
      JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).agent,
    ).not.toHaveProperty('model');
    expect(
      vi.mocked(fetchWithRetries).mock.calls.some(([, request]) => request?.method === 'DELETE'),
    ).toBe(false);
    expect(attachedProviderMethod).not.toHaveBeenCalled();
  });

  it.each(['', 'gpt-6-astra'])('preserves model suffix precedence (%s)', async (suffix) => {
    const agentProvider = new OpenAiAgentsApiProvider(suffix, { config: { apiKey: 'test-key' } });
    await agentProvider.callApi('hi', {
      vars: {},
      prompt: { raw: 'hi', label: 'test', config: { agent: { model: 'gpt-5.6' } } },
    });
    expect(
      JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).agent.model,
    ).toBe(suffix || 'gpt-5.6');
  });

  it('allows prompt config to override a configured model without a suffix', async () => {
    await provider({ model: 'gpt-6-astra' }).callApi('hi', {
      vars: {},
      prompt: { raw: 'hi', label: 'test', config: { agent: { model: 'gpt-5.6' } } },
    });

    expect(
      JSON.parse(vi.mocked(fetchWithRetries).mock.calls[0][1]!.body as string).agent.model,
    ).toBe('gpt-5.6');
  });

  it('isolates per-prompt credentials and lifecycle settings across concurrent calls', async () => {
    const agentProvider = provider();
    const results = await Promise.all(
      ['first', 'second'].map((name) =>
        agentProvider.callApi(name, {
          vars: { name },
          prompt: {
            raw: name,
            label: name,
            config: {
              apiKey: '{{name}}-key',
              apiBaseUrl: 'https://{{name}}.example/v1',
              agent: { instructions: '{{name}}' },
              retainSession: name === 'first',
            },
          },
        }),
      ),
    );
    expect(results.every((result) => result.output === '42')).toBe(true);
    for (const [url, request] of vi.mocked(fetchWithRetries).mock.calls) {
      const name = new URL(String(url)).hostname.split('.')[0];
      expect(new Headers(request!.headers).get('Authorization')).toBe(`Bearer ${name}-key`);
      if (request?.method === 'POST') {
        expect(JSON.parse(request.body as string).agent.instructions).toBe(name);
      }
      if (request?.method === 'DELETE') {
        expect(name).toBe('second');
      }
    }
    expect(results[1].metadata?.sessionDeleted).toBe(true);
    expect(agentProvider.config.apiKey).toBe('test-key');
    expect(agentProvider.config.apiBaseUrl).toBeUndefined();
  });

  it('resolves prompt-level keys, key opt-in, and URL credentials from the merged config', async () => {
    mockProcessEnv({ OPENAI_API_KEY: 'ambient-openai-key', PROMPT_OPENAI_KEY: 'prompt-envar-key' });
    const authorizationsFor = async (
      agentProvider: OpenAiAgentsApiProvider,
      config: Record<string, unknown>,
    ) => {
      vi.mocked(fetchWithRetries).mockClear();
      const result = await agentProvider.callApi('hi', {
        vars: {},
        prompt: { raw: 'hi', label: 'test', config },
      });
      expect(result.output).toBe('42');
      return new Set(
        vi
          .mocked(fetchWithRetries)
          .mock.calls.map(([, request]) => new Headers(request!.headers).get('Authorization')),
      );
    };
    const headerGateway = new OpenAiAgentsApiProvider('', {
      config: {
        apiBaseUrl: 'https://gateway.example/v1',
        headers: { 'api-key': 'gateway-credential' },
      },
    });
    expect(await authorizationsFor(headerGateway, {})).toEqual(new Set([null]));
    expect(await authorizationsFor(headerGateway, { apiKeyEnvar: 'PROMPT_OPENAI_KEY' })).toEqual(
      new Set(['Bearer prompt-envar-key']),
    );
    expect(await authorizationsFor(headerGateway, { apiKey: 'prompt-literal-key' })).toEqual(
      new Set(['Bearer prompt-literal-key']),
    );
    // A prompt-level base URL credential identifies a gateway as well.
    expect(
      await authorizationsFor(new OpenAiAgentsApiProvider(), {
        apiBaseUrl: 'https://gateway.example/v1?api-key=prompt-gateway-secret',
      }),
    ).toEqual(new Set([null]));
  });

  it('redacts a prompt-level key variable when request headers cannot be built', async () => {
    // Header validation errors quote the rejected value, which here includes the API key.
    mockProcessEnv({ PROMPT_OPENAI_KEY: 'prompt!envar!secret\nsecond!line' });
    const result = await new OpenAiAgentsApiProvider().callApi('hi', {
      vars: {},
      prompt: { raw: 'hi', label: 'test', config: { apiKeyEnvar: 'PROMPT_OPENAI_KEY' } },
    });
    expect(result.error).toContain('invalid header value');
    expect(result.error).not.toContain('prompt!envar!secret');
    expect(result.error).not.toContain('second!line');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('validates per-prompt lifecycle settings before creating a session', async () => {
    const result = await provider().callApi('hi', {
      vars: {},
      prompt: { raw: 'hi', label: 'test', config: { timeoutMs: 0 } },
    });
    expect(result.error).toContain('timeoutMs must be a positive integer');
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('honors scoped credentials and case-insensitive header overrides on custom URLs', async () => {
    const agentProvider = new OpenAiAgentsApiProvider('', {
      env: { OPENAI_API_KEY: 'scoped-key', OPENAI_ORGANIZATION: 'scoped-org' },
      config: {
        apiBaseUrl: 'https://gateway.example/v1/?tenant=one',
        headers: { authorization: 'Bearer header-key' },
      },
    });
    await agentProvider.callApi('hi');
    for (const [url, request] of vi.mocked(fetchWithRetries).mock.calls) {
      expect(new URL(String(url)).searchParams.get('tenant')).toBe('one');
      const headers = new Headers(request!.headers);
      expect(headers.get('Authorization')).toBe('Bearer header-key');
      expect(headers.get('OpenAI-Organization')).toBe('scoped-org');
    }
  });

  it.each([0, -1, NaN, Infinity, 1.5, 2_147_483_648])(
    'rejects invalid timeout, poll, and cleanup values: %s',
    (value) => {
      expect(() => provider({ timeoutMs: value })).toThrow('positive integer');
      expect(() => provider({ pollIntervalMs: value })).toThrow('positive integer');
      expect(() => provider({ cleanupTimeoutMs: value })).toThrow('positive integer');
    },
  );

  it.each([-1, NaN, 1.5, 2_147_483_648])('rejects invalid usage wait values: %s', (value) => {
    expect(() => provider({ usageTimeoutMs: value })).toThrow('non-negative integer');
  });

  it('rejects an unsupported environment type', () => {
    expect(() =>
      provider({ environment: { type: 'self_hosted' } as unknown as { type: 'none' } }),
    ).toThrow('environment.type must be "none" or "openai_hosted"');
  });

  it.each([400, 401, 403, 429, 500])(
    'reports HTTP %s as an error with no false output',
    async (status) => {
      vi.mocked(fetchWithRetries).mockResolvedValue(new Response('upstream error', { status }));
      const result = await provider().callApi('hi');
      expect(result.error).toContain(`HTTP ${status}`);
      expect(result.output).toBeUndefined();
      // Session creation is never replayed, even after a transient server error.
      expect(fetchWithRetries).toHaveBeenCalledTimes(1);
    },
  );

  it('reports a missing session ID without attempting cleanup', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(json({ status: 'idle' }));
    const result = await provider().callApi('hi');
    expect(result.error).toBe('Agents API did not return a session ID');
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  });

  it('reports an invalid list response', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ data: null }));
    expect(await provider().callApi('hi')).toMatchObject({
      error: 'Agents API returned an invalid list response',
      metadata: { sessionDeleted: true },
    });
  });

  it('waits through initial idle and completed subagent turns until the root finishes', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...turn, subagent_id: 'child' }])))
      .mockResolvedValueOnce(json(session));
    const pending = provider().callApi('hi');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await pending).toMatchObject({ output: '42' });
    expect(
      vi.mocked(fetchWithRetries).mock.calls.filter(([url]) => String(url).includes('/turns?')),
    ).toHaveLength(3);
  });

  it.each(['failed', 'cancelled'])('does not treat a %s root turn as success', async (status) => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...turn, status, error: { message: 'task stopped' } }])));
    const result = await provider().callApi('hi');
    expect(result.error).toContain(`turn ${status}: task stopped`);
    expect(result.output).toBeUndefined();
    expect(result.metadata).toMatchObject({ sessionCancelled: true, sessionDeleted: true });
  });

  it('reports required client actions and removes the waiting session', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      json({
        ...session,
        status: 'requires_action',
        required_actions: [{ type: 'function_call' }],
      }),
    );
    const result = await provider().callApi('hi');
    expect(result.error).toContain('requires client-side actions (function_call)');
    expect(result.metadata).toMatchObject({ sessionCancelled: true, sessionDeleted: true });
  });

  it('cancels unfinished work and retries deletion until the session is idle', async () => {
    vi.useFakeTimers();
    let deletions = 0;
    mockApi((pathname, method) => {
      if (method === 'DELETE') {
        deletions++;
        return deletions < 3
          ? apiError(
              409,
              'session must be durably idle or failed without required actions before deletion',
            )
          : undefined;
      }
      if (pathname.endsWith('/events')) {
        return new Response(null, { status: 202 });
      }
      return method === 'POST'
        ? json({
            ...session,
            status: 'requires_action',
            required_actions: [{ type: 'function_call' }],
          })
        : undefined;
    });
    const pending = provider().callApi('hi');
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await pending;
    expect(result.error).toContain('requires client-side actions (function_call)');
    expect(result.metadata).toMatchObject({ sessionCancelled: true, sessionDeleted: true });
    expect(deletions).toBe(3);
    const requests = calls();
    const cancel = requests.findIndex((request) => request.pathname.endsWith('/events'));
    expect(JSON.parse(requests[cancel].options!.body as string)).toEqual({
      events: [{ type: 'agent.session.input.cancel' }],
    });
    expect(requests.findIndex((request) => request.method === 'DELETE')).toBeGreaterThan(cancel);
  });

  it('still deletes a session when the API rejects cancellation', async () => {
    mockApi((pathname) => {
      if (pathname.endsWith('/events')) {
        return apiError(400, 'no active turn to cancel');
      }
      return pathname.endsWith('/turns')
        ? json(page([{ ...turn, status: 'failed', error: { message: 'stopped' } }]))
        : undefined;
    });
    const result = await provider().callApi('hi');
    expect(result.error).toContain('turn failed: stopped');
    expect(result.metadata).toMatchObject({ sessionDeleted: true });
    expect(result.metadata).not.toHaveProperty('sessionCancelled');
  });

  it('reports a redacted cleanup timeout and skips cancellation after success', async () => {
    vi.useFakeTimers();
    mockApi((_pathname, method) =>
      method === 'DELETE' ? apiError(409, 'session busy for test-key') : undefined,
    );
    const pending = provider({ cleanupTimeoutMs: 3_000 }).callApi('hi');
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await pending;
    expect(result.output).toBe('42');
    expect(result.error).toBeUndefined();
    expect(result.metadata).toMatchObject({
      sessionDeleted: false,
      cleanupError: expect.stringContaining('cleanup timed out after 3000ms'),
    });
    expect(result.metadata?.cleanupError).toContain('HTTP 409');
    expect(result.metadata?.cleanupError).not.toContain('test-key');
    expect(result.metadata).not.toHaveProperty('sessionCancelled');
    expect(calls().some((request) => request.pathname.endsWith('/events'))).toBe(false);
  });

  it('paginates turns and output, excluding commentary and other turns', async () => {
    const commentary = {
      ...message,
      id: 'commentary',
      phase: 'commentary',
      content: [{ type: 'output_text', text: 'Thinking' }],
    };
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(page([{ ...turn, id: 'child_turn', subagent_id: 'child' }], true, 'child_turn')),
      )
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(page([commentary, { ...message, turn_id: 'old_turn' }], true, 'item/one')),
      )
      .mockResolvedValueOnce(json(page([message])));
    expect(await provider().callApi('hi')).toMatchObject({ output: '42' });
    const urls = vi.mocked(fetchWithRetries).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes('after=child_turn'))).toBe(true);
    expect(urls.some((url) => url.includes('after=item%2Fone'))).toBe(true);
  });

  it('rejects looping pagination instead of silently truncating the result', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([], true, 'same')))
      .mockResolvedValueOnce(json(page([], true, 'same')));
    expect(await provider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('pagination cursor'),
    });
  });

  it('rejects a completed turn with only commentary', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...message, phase: 'commentary' }])));
    expect(await provider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('without a final assistant answer'),
    });
  });

  it('reports tool failures as metadata without confusing them with the final answer', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(
          page([
            { id: 'cmd', type: 'command_execution', status: 'failed', turn_id: turn.id },
            message,
          ]),
        ),
      );
    const result = await provider().callApi('hi');
    expect(result.output).toBe('42');
    expect(result.metadata?.toolCalls).toEqual([
      { id: 'cmd', type: 'command_execution', status: 'failed', turnId: turn.id },
    ]);
  });

  it('excludes assistant, inter-agent, and reasoning messages from tool summaries', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(
          page([
            { id: 'rs_root', type: 'reasoning', status: 'completed', turn_id: turn.id },
            {
              id: 'amsg_child',
              type: 'agent_message',
              turn_id: turn.id,
              sender_agent_id: 'agent_child',
              recipient_agent_id: 'agent_root',
              content: 'child result',
            },
            { id: 'cmd', type: 'command_execution', status: 'completed', turn_id: turn.id },
            message,
          ]),
        ),
      );
    const result = await provider().callApi('hi');
    expect(result.output).toBe('42');
    expect(result.metadata?.toolCalls).toEqual([
      { id: 'cmd', type: 'command_execution', status: 'completed', turnId: turn.id },
    ]);
    // Single-agent sessions do not read subagent histories.
    expect(calls().some((request) => request.pathname.includes('/subagents'))).toBe(false);
  });

  describe('subagent tool calls', () => {
    // Shapes follow a live multi-agent session: session items hold only the root agent's work,
    // while GET /subagents and GET /subagents/{id}/items hold each subagent's own history.
    const subagentId = 'subagent_8f32a092efbe64b1';
    const subagentTurnId = 'turn_eed94c155401f4c7';
    const createCall = {
      type: 'create_subagent_call',
      id: 'call_create',
      turn_id: turn.id,
      status: 'completed',
      agent_id: 'agent_root',
      model: 'gpt-6-astra',
    };
    const rootItems = [
      {
        type: 'message',
        id: 'msg_user',
        turn_id: turn.id,
        role: 'user',
        content: [{ type: 'input_text', text: 'hi' }],
        status: 'completed',
        phase: null,
      },
      createCall,
      {
        type: 'agent_message',
        id: 'amsg_to_child',
        turn_id: turn.id,
        sender_agent_id: 'agent_root',
        recipient_agent_id: subagentId,
        content: [{ type: 'output_text', text: 'Run the command' }],
      },
      {
        type: 'wait_for_subagents_call',
        id: 'call_wait',
        turn_id: turn.id,
        status: 'completed',
        sender_agent_id: 'agent_root',
        recipient_agent_ids: [subagentId],
      },
      {
        type: 'agent_message',
        id: 'amsg_from_child',
        turn_id: turn.id,
        sender_agent_id: subagentId,
        recipient_agent_id: 'agent_root',
        content: [{ type: 'output_text', text: '99' }],
      },
      message,
    ];
    const subagentMessage = (id: string, role: string, phase: string | null, text: string) => ({
      type: 'message',
      id,
      turn_id: subagentTurnId,
      role,
      content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
      status: 'completed',
      phase,
    });
    const subagentPages = [
      page(
        [
          subagentMessage('msg_child_task', 'user', null, 'Run the command'),
          {
            type: 'reasoning',
            id: 'rs_child',
            turn_id: subagentTurnId,
            summary: [],
            status: 'completed',
          },
          {
            type: 'mcp_call',
            id: 'call_mcp',
            turn_id: subagentTurnId,
            server_label: 'codex',
            name: 'list_mcp_resources',
            arguments: '{}',
            status: 'completed',
            output: '{}',
            error: null,
          },
        ],
        true,
        'call_mcp',
      ),
      page([
        { type: 'command_execution', id: 'call_cmd', turn_id: subagentTurnId, status: 'failed' },
        subagentMessage('msg_child_answer', 'assistant', 'final_answer', '99'),
      ]),
    ];
    const rootItemsRoute = (pathname: string) =>
      pathname.endsWith('/sess_test/items') ? json(page([createCall, message])) : undefined;

    it('reports subagent tool calls from subagent histories without scoring subagent messages', async () => {
      vi.mocked(fetchWithRetries).mockImplementation(async (url, options) => {
        const { pathname, searchParams } = new URL(String(url));
        if (pathname.endsWith('/sess_test/items')) {
          return json(page(rootItems));
        }
        if (pathname.endsWith('/sess_test/subagents')) {
          return json(
            page([
              {
                id: subagentId,
                object: 'agent.session.subagent',
                session_id: session.id,
                name: 'Chandrasekhar',
                parent_agent_id: 'agent_root',
                status: 'active',
                opened_at: 1,
                closed_at: null,
              },
            ]),
          );
        }
        if (pathname.endsWith(`/subagents/${subagentId}/items`)) {
          return json(subagentPages[searchParams.get('after') === 'call_mcp' ? 1 : 0]);
        }
        return defaultResponse(pathname, options?.method);
      });
      const result = await provider().callApi('hi');
      expect(result.output).toBe('42');
      expect(result.metadata).toMatchObject({ turnId: turn.id, sessionDeleted: true });
      expect(result.metadata).not.toHaveProperty('subagentToolCallsUnavailable');
      expect(result.metadata?.toolCalls).toEqual([
        { id: 'call_create', type: 'create_subagent_call', status: 'completed', turnId: turn.id },
        { id: 'call_wait', type: 'wait_for_subagents_call', status: 'completed', turnId: turn.id },
        {
          id: 'call_mcp',
          type: 'mcp_call',
          name: 'list_mcp_resources',
          status: 'completed',
          turnId: subagentTurnId,
        },
        { id: 'call_cmd', type: 'command_execution', status: 'failed', turnId: subagentTurnId },
      ]);
      // Observed subagents still leave aggregate usage unpriced.
      expect(result.cost).toBeUndefined();
      expect(
        vi
          .mocked(fetchWithRetries)
          .mock.calls.filter(([url]) => String(url).includes(`/subagents/${subagentId}/items`))
          .map(([url]) => new URL(String(url)).searchParams.get('after')),
      ).toEqual([null, 'call_mcp']);
    });

    it('keeps the answer and flags subagent tool calls it cannot read', async () => {
      mockApi(
        (pathname) =>
          rootItemsRoute(pathname) ??
          (pathname.endsWith('/subagents') ? apiError(403, 'missing api.agents.read') : undefined),
      );
      const result = await provider().callApi('hi');
      expect(result.output).toBe('42');
      expect(result.error).toBeUndefined();
      expect(result.metadata).toMatchObject({
        subagentToolCallsUnavailable: true,
        sessionDeleted: true,
        toolCalls: [
          { id: 'call_create', type: 'create_subagent_call', status: 'completed', turnId: turn.id },
        ],
      });
    });

    it('propagates eval cancellation while reading subagent tool calls', async () => {
      const controller = new AbortController();
      mockApi((pathname) => {
        if (pathname.endsWith('/subagents')) {
          controller.abort(new Error('cancel eval'));
          return apiError(403, 'cancelled');
        }
        return rootItemsRoute(pathname);
      });
      await expect(
        provider().callApi('hi', undefined, { abortSignal: controller.signal }),
      ).rejects.toThrow('cancel eval');
      expect(calls().at(-1)?.method).toBe('DELETE');
    });
  });

  it('retains successful sessions only when requested and never caches executions', async () => {
    const agentProvider = provider({ retainSession: true });
    expect((await agentProvider.callApi('hi')).cached).toBe(false);
    expect((await agentProvider.callApi('hi')).cached).toBe(false);
    const calls = vi.mocked(fetchWithRetries).mock.calls;
    expect(calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(2);
    expect(calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  });

  it('preserves the eval result and reports cleanup failures', async () => {
    mockApi((_pathname, method) =>
      method === 'DELETE' ? apiError(403, 'missing api.agents.write') : undefined,
    );
    const result = await provider().callApi('hi');
    expect(result).toMatchObject({
      output: '42',
      metadata: {
        sessionDeleted: false,
        cleanupError: expect.stringContaining('HTTP 403'),
      },
    });
    expect(result.metadata?.cleanupError).toContain('missing api.agents.write');
  });

  it('retries a transient deletion failure', async () => {
    vi.useFakeTimers();
    let deletions = 0;
    mockApi((_pathname, method) => {
      if (method !== 'DELETE') {
        return undefined;
      }
      deletions++;
      return deletions === 1 ? new Response(null, { status: 503 }) : undefined;
    });
    const pending = provider().callApi('hi');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await pending).toMatchObject({ output: '42', metadata: { sessionDeleted: true } });
    expect(deletions).toBe(2);
  });

  it('retries reads and idempotent cleanup, but never session creation', async () => {
    await provider({ maxRetries: 3 }).callApi('hi');
    for (const [, request, , retries] of vi.mocked(fetchWithRetries).mock.calls) {
      expect(retries).toBe(request?.method === 'POST' ? 0 : 3);
    }
  });

  it('retries transient status reads before failing the run', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const pending = provider().callApi('hi');
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await pending).toMatchObject({ output: '42', metadata: { sessionDeleted: true } });
    expect(calls().filter((request) => request.pathname.endsWith('/turns'))).toHaveLength(3);
  });

  it('fails after exhausting transient read retries', async () => {
    vi.useFakeTimers();
    mockApi((_pathname, method) =>
      method === 'GET' ? new Response(null, { status: 503 }) : undefined,
    );
    const pending = provider({ maxRetries: 1 }).callApi('hi');
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await pending;
    expect(result.error).toContain('HTTP 503');
    expect(result.metadata).toMatchObject({ sessionDeleted: true });
    expect(calls().filter((request) => request.pathname.endsWith('/turns'))).toHaveLength(2);
  });

  it('treats an already deleted session as successful cleanup', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([message])))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await provider().callApi('hi')).toMatchObject({
      output: '42',
      metadata: { sessionDeleted: true },
    });
  });

  it('preserves a completed empty text answer', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(page([{ ...message, content: [{ type: 'output_text', text: '' }] }])),
      );
    const result = await provider().callApi('hi');
    expect(result.output).toBe('');
    expect(result.error).toBeUndefined();
  });

  it('rejects a final message with no text value', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...message, content: [{ type: 'output_text' }] }])));
    expect(await provider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('without a final assistant answer'),
    });
  });

  it('bounds polling with the overall timeout and cleans up', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([])));
    const pending = provider({ timeoutMs: 100, pollIntervalMs: 1_000 }).callApi('hi');
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({
      error: 'Agents API request timed out after 100ms',
      metadata: { sessionCancelled: true, sessionDeleted: true },
    });
  });

  it('propagates cancellation but uses an independent signal for cleanup', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([])));
    const controller = new AbortController();
    const pending = provider().callApi('hi', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow('cancel eval');
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error('cancel eval'));
    await rejected;
    const [cancel, deletion] = calls().slice(-2);
    expect(cancel.pathname).toMatch(/\/events$/);
    expect(deletion.method).toBe('DELETE');
    expect(cancel.options?.signal?.aborted).toBe(false);
    expect(deletion.options?.signal?.aborted).toBe(false);
  });

  it('honors eval cancellation that arrives while cleanup retries deletion', async () => {
    vi.useFakeTimers();
    let deletions = 0;
    mockApi((_pathname, method) => {
      if (method !== 'DELETE') {
        return undefined;
      }
      deletions++;
      return deletions < 3 ? apiError(409, 'session must be durably idle') : undefined;
    });
    const controller = new AbortController();
    const pending = provider().callApi('hi', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow('cancel eval');
    await vi.waitFor(() => expect(deletions).toBeGreaterThan(0));
    controller.abort(new Error('cancel eval'));
    await vi.advanceTimersByTimeAsync(5_000);
    await rejected;
    // The session is still released even though the caller cancelled mid-cleanup.
    expect(deletions).toBe(3);
  });

  it('does not create a session after cancellation', async () => {
    await expect(
      provider().callApi('hi', undefined, { abortSignal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('waits for final session usage before deleting the session', async () => {
    vi.useFakeTimers();
    const sessionUsage = { ...usage, input_tokens: 110, total_tokens: 130 };
    let sessionReads = 0;
    mockApi((pathname, method) => {
      if (pathname.endsWith('/turns')) {
        return json(page([{ ...turn, usage: null }]));
      }
      if (pathname.endsWith('/sess_test') && method === 'GET') {
        sessionReads++;
        return json({ ...session, usage: sessionReads >= 3 ? sessionUsage : null });
      }
      return method === 'POST' ? json({ ...session, usage: null }) : undefined;
    });
    const pending = provider().callApi('hi');
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    // Session totals take precedence over root-turn usage once both are available.
    expect(result.tokenUsage).toMatchObject({ prompt: 110, completion: 20, total: 130 });
    expect(result.cost).toBeGreaterThan(0);
    expect(result.metadata).not.toHaveProperty('usageUnavailable');
    expect(sessionReads).toBe(3);
    const requests = calls();
    const lastSessionRead = requests
      .map((request) => request.method === 'GET' && request.pathname.endsWith('/sess_test'))
      .lastIndexOf(true);
    expect(requests.findIndex((request) => request.method === 'DELETE')).toBeGreaterThan(
      lastSessionRead,
    );
  });

  it('keeps a successful answer when final usage stays unavailable', async () => {
    vi.useFakeTimers();
    mockApi(withoutUsage);
    const pending = provider({ usageTimeoutMs: 2_000 }).callApi('hi');
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await pending;
    expect(result).toMatchObject({
      output: '42',
      metadata: { usageUnavailable: true, sessionDeleted: true },
    });
    expect(result.error).toBeUndefined();
    expect(result.tokenUsage).toBeUndefined();
    expect(result.cost).toBeUndefined();
  });

  it('falls back to root-turn usage when session totals lag', async () => {
    vi.useFakeTimers();
    mockApi((pathname, method) =>
      pathname.endsWith('/turns/turn_test') ? json(turn) : withoutUsage(pathname, method),
    );
    const pending = provider().callApi('hi');
    await vi.advanceTimersByTimeAsync(7_000);
    const result = await pending;
    expect(result.tokenUsage).toMatchObject({ prompt: 100, completion: 20, total: 120 });
    expect(result.metadata).not.toHaveProperty('usageUnavailable');
    expect(result.metadata).toMatchObject({ sessionDeleted: true });
  });

  it('skips the usage wait when usageTimeoutMs is 0', async () => {
    mockApi(withoutUsage);
    const result = await provider({ usageTimeoutMs: 0 }).callApi('hi');
    expect(result.metadata).toMatchObject({ usageUnavailable: true, sessionDeleted: true });
    expect(
      calls().filter(
        (request) => request.method === 'GET' && request.pathname.endsWith('/sess_test'),
      ),
    ).toHaveLength(1);
  });

  it('does not turn a completed answer into a timeout while waiting for usage', async () => {
    vi.useFakeTimers();
    mockApi(withoutUsage);
    const pending = provider({ timeoutMs: 1_500 }).callApi('hi');
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await pending;
    expect(result).toMatchObject({
      output: '42',
      metadata: { usageUnavailable: true, sessionDeleted: true },
    });
    expect(result.error).toBeUndefined();
  });

  it('propagates eval cancellation while waiting for usage', async () => {
    vi.useFakeTimers();
    mockApi(withoutUsage);
    const controller = new AbortController();
    const pending = provider().callApi('hi', undefined, { abortSignal: controller.signal });
    const rejected = expect(pending).rejects.toThrow('cancel eval');
    await vi.advanceTimersByTimeAsync(500);
    controller.abort(new Error('cancel eval'));
    await rejected;
    expect(calls().at(-1)?.method).toBe('DELETE');
  });

  it('accepts completed assistant output when the API leaves its phase unset', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([turn])))
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json(page([{ ...message, phase: null }])));
    expect(await provider().callApi('hi')).toMatchObject({ output: '42' });
  });

  it('preserves API validation details while redacting echoed credentials', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message:
              'Invalid environment promptfoo-qa for test-key, alternate_credential_value, and nested_secret',
          },
        }),
        { status: 400 },
      ),
    );
    const result = await provider({
      headers: { 'X-Api-Key': 'alternate_credential_value' },
      agent: { tools: [{ headers: { Authorization: 'nested_secret' } }] },
    }).callApi('hi');
    expect(result.error).toContain('Invalid environment promptfoo-qa');
    expect(result.error).not.toContain('test-key');
    expect(result.error).not.toContain('alternate_credential_value');
    expect(result.error).not.toContain('nested_secret');
    expect(result.error).toContain('[REDACTED]');
  });

  it('redacts credentials echoed in failed turn errors without mangling short values', async () => {
    vi.mocked(fetchWithRetries)
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(
        json(
          page([
            {
              ...turn,
              status: 'failed',
              error: {
                code: 'mcp_error',
                message:
                  'MCP rejected Authorization: Bearer nested-token-value (nested-token-value), subscription-secret-value, and query-secret-value for req_1a2b at index 1',
              },
            },
          ]),
        ),
      );
    const result = await provider({
      headers: { 'x-api-key': '1' },
      agent: {
        tools: [
          {
            type: 'mcp',
            server_url: 'https://mcp.example/sse?key=query-secret-value',
            headers: {
              Authorization: 'Bearer nested-token-value',
              'X-Subscription-Key': 'subscription-secret-value',
            },
          },
        ],
      },
    }).callApi('hi');
    expect(result.error).toContain('Agents API turn failed: MCP rejected Authorization:');
    expect(result.error).toContain('for req_1a2b at index 1');
    for (const secret of [
      'nested-token-value',
      'subscription-secret-value',
      'query-secret-value',
    ]) {
      expect(result.error).not.toContain(secret);
    }
    expect(result.metadata).toMatchObject({ sessionDeleted: true });
  });

  const credentialUrl =
    'https://gateway-user-name:gateway-password-value@gateway.example/v1?api-key=query+secret/value';

  it.each([
    {
      source: 'provider config',
      options: { config: { apiKey: 'test-key', apiBaseUrl: credentialUrl } },
      processEnv: {},
    },
    {
      source: 'OPENAI_BASE_URL',
      options: { config: { apiKey: 'test-key' } },
      processEnv: { OPENAI_BASE_URL: credentialUrl },
    },
    {
      source: 'scoped env overrides',
      options: { config: { apiKey: 'test-key' }, env: { OPENAI_API_BASE_URL: credentialUrl } },
      processEnv: {},
    },
  ])('redacts base URL credentials from $source in API errors', async ({ options, processEnv }) => {
    mockProcessEnv(processEnv);
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      apiError(401, `Gateway rejected ${credentialUrl}`),
    );
    const result = await new OpenAiAgentsApiProvider('', options).callApi('hi');
    expect(result.error).toContain('HTTP 401');
    expect(result.error).toContain('Gateway rejected https://');
    for (const secret of ['gateway-user-name', 'gateway-password-value', 'query+secret/value']) {
      expect(result.error).not.toContain(secret);
    }
  });

  it('redacts failed session errors and OpenAI-style keys', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      json({
        ...session,
        status: 'failed',
        error: 'Rejected sk-live1234567890abcdefXYZ for test-key',
      }),
    );
    const result = await provider().callApi('hi');
    expect(result.error).toBe('Agents API session failed: Rejected [REDACTED] for [REDACTED]');
    expect(result.metadata).toMatchObject({ sessionCancelled: true, sessionDeleted: true });
  });

  it('limits error detail length', async () => {
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'x'.repeat(4_000) },
        }),
        { status: 400 },
      ),
    );
    const result = await provider().callApi('hi');
    expect(result.error).toContain('HTTP 400');
    expect(result.error!.length).toBeLessThan(1_100);
  });

  it('stops reading oversized error streams and cancels the body', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(1_024)));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.mocked(fetchWithRetries).mockResolvedValueOnce(new Response(body, { status: 400 }));
    expect(await provider().callApi('hi')).toMatchObject({
      error: expect.stringContaining('HTTP 400'),
    });
    expect(cancelled).toBe(true);
  });

  it.each([true, false])(
    'does not price aggregate subagent usage (enabled=%s)',
    async (enabled) => {
      vi.mocked(fetchWithRetries)
        .mockResolvedValueOnce(json(session))
        .mockResolvedValueOnce(json(page([turn])))
        .mockResolvedValueOnce(
          json({ ...session, agent: { ...session.agent, multi_agent: { enabled } } }),
        )
        .mockResolvedValueOnce(
          json(
            page([
              ...(enabled ? [] : [{ id: 'child', type: 'create_subagent_call', turn_id: turn.id }]),
              message,
            ]),
          ),
        );
      const result = await provider().callApi('hi');
      expect(result.output).toBe('42');
      expect(result.tokenUsage?.total).toBe(120);
      expect(result.cost).toBeUndefined();
      expect(result.metadata?.costScope).toBe('unavailable for aggregate subagent usage');
    },
  );
});
