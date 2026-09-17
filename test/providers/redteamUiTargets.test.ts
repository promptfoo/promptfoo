import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { mockProcessEnv } from '../util/utils';

const { send, subscribe } = vi.hoisted(() => ({ send: vi.fn(), subscribe: vi.fn() }));
vi.mock('../../src/telemetry', () => ({ default: { record: vi.fn() } }));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
  isCacheEnabled: () => false,
}));
vi.mock('@aws-sdk/client-bedrock-agent-runtime', async (importOriginal) => ({
  ...(await importOriginal()),
  BedrockAgentRuntimeClient: vi.fn(function () {
    return { send };
  }),
}));
vi.mock('@fal-ai/client', () => ({
  createFalClient: vi.fn(() => ({ subscribe })),
}));

type Target = { id: string; config: Record<string, unknown> };
let initialConfigs: Record<string, Target>;
let persistedTargets: Record<string, Target>;
let destinationTargets: Record<string, Target>;
let directlyImportedTargets: Record<string, Target>;

beforeAll(() => {
  // The app owns this browser-only module in a separate TypeScript project. Read its
  // actual exports through that runtime boundary instead of importing app source
  // into the backend compiler project.
  const helperUrl = new URL(
    '../../src/app/src/pages/redteam/setup/components/Targets/providerInitialConfig.ts',
    import.meta.url,
  );
  const providerTypes = [
    'together',
    'huggingface',
    'bedrock-agent',
    'fal',
    'cloudflare-ai',
    'llama.cpp',
    'llamafile',
    'vllm',
    'text-generation-webui',
    'ollama',
    'databricks',
    'deepseek',
    'groq',
    'cerebras',
  ];
  const editorHelperUrl = new URL(
    '../../src/app/src/pages/redteam/setup/components/Targets/helpers.ts',
    import.meta.url,
  );
  const storeUrl = new URL('../../src/app/src/stores/evalConfig.ts', import.meta.url);
  const redteamStoreUrl = new URL(
    '../../src/app/src/pages/redteam/setup/hooks/useRedTeamConfig.ts',
    import.meta.url,
  );
  const exportUrl = new URL('../../src/redteam/sharedFrontend.ts', import.meta.url);
  const script = `
    const { getProviderInitialConfig } = await import(${JSON.stringify(helperUrl.href)});
    const { withLocalProviderType } = await import(${JSON.stringify(editorHelperUrl.href)});
    const initialConfigs = Object.fromEntries(
      ${JSON.stringify(providerTypes)}.map(type => [type, getProviderInitialConfig(type)])
    );
    const storage = new Map();
    globalThis.localStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    };
    const session = new Map();
    globalThis.window = Object.assign(new EventTarget(), {
      localStorage: globalThis.localStorage,
      sessionStorage: {
        getItem: key => session.get(key) ?? null,
        setItem: (key, value) => session.set(key, value),
        removeItem: key => session.delete(key),
      },
    });
    // This single-context fixture does not simulate cross-tab BroadcastChannel delivery.
    globalThis.BroadcastChannel = undefined;
    const { useStore } = await import(${JSON.stringify(storeUrl.href)});
    const persistedTargets = {};
    const destinationTargets = {};
    for (const type of ['llamafile', 'vllm', 'text-generation-webui']) {
      for (const [auth, config] of Object.entries({
        none: {},
        inline: { apiKey: 'private-session-key' },
        selected: { apiKeyEnvar: 'LOCAL_MODEL_KEY' },
      })) {
        const target = structuredClone(initialConfigs[type]);
        target.id = 'openai:chat:tenant/private-served-model:Q4_K_M';
        // Replace the complete JSON just as the target editor does, then persist it.
        target.config = withLocalProviderType(target.id, {
          apiBaseUrl: target.config.apiBaseUrl, ...config, stop: ['<end>'],
        }, type);
        useStore.getState().setConfig({ providers: [target] });
        const saved = localStorage.getItem('promptfoo');
        useStore.setState({ config: {} });
        localStorage.setItem('promptfoo', saved);
        await useStore.persist.rehydrate();
        persistedTargets[type + ':' + auth] = useStore.getState().config.providers[0];
      }
    }
    for (const type of ['llamafile', 'vllm', 'text-generation-webui']) {
      for (const [endpoint, config] of Object.entries({
        omitted: {},
        empty: { apiBaseUrl: '' },
        whitespace: { apiBaseUrl: '  ' },
        null: { apiBaseUrl: null },
        custom: { apiBaseUrl: 'https://local-deployment.example.test/custom/v1' },
        host: { apiHost: 'local-host.example.test' },
        hostPriority: {
          apiHost: 'local-host.example.test/tenant',
          apiBaseUrl: 'https://api.openai.com/v1',
        },
        nativeHostPriority: {
          apiHost: 'api.openai.com',
          apiBaseUrl: 'https://local-deployment.example.test/custom/v1',
        },
      })) {
        const id = 'openai:chat:tenant/private-served-model:Q4_K_M';
        const target = { id, config: withLocalProviderType(id, {
          ...config, apiKeyEnvar: 'LOCAL_MODEL_KEY', max_tokens: 100,
        }, type) };
        useStore.getState().setConfig({ providers: [target] });
        const saved = localStorage.getItem('promptfoo');
        useStore.setState({ config: {} });
        localStorage.setItem('promptfoo', saved);
        await useStore.persist.rehydrate();
        destinationTargets[type + ':' + endpoint] = useStore.getState().config.providers[0];
      }
    }
    const { useRedTeamConfig } = await import(${JSON.stringify(redteamStoreUrl.href)});
    const { getUnifiedConfig } = await import(${JSON.stringify(exportUrl.href)});
    const directlyImportedTargets = {};
    for (const type of ['llamafile', 'vllm', 'text-generation-webui']) {
      for (const [omission, config] of Object.entries({
        all: {},
        endpoint: { apiKeyRequired: false, useDefaultApiKey: false },
        defaultKey: { apiBaseUrl: 'https://custom.example.test/v1', apiKeyRequired: false },
        requiredKey: { apiBaseUrl: 'https://custom.example.test/v1', useDefaultApiKey: false },
        inline: { apiKey: 'synthetic-inline-key' },
        named: { apiKeyEnvar: 'LOCAL_MODEL_KEY' },
        optIn: { useDefaultApiKey: true },
        missingNamed: { apiKeyEnvar: 'MISSING_LOCAL_KEY', useDefaultApiKey: true },
        requiredMissingNamed: { apiKeyEnvar: 'MISSING_LOCAL_KEY', apiKeyRequired: true },
        host: { apiHost: 'preferred.example.test/tenant', apiBaseUrl: 'https://other.example.test/v1' },
      })) {
        // Import a plain incomplete target directly: no selection, format, or helper call.
        useRedTeamConfig.getState().setFullConfig({
          ...useRedTeamConfig.getInitialState().config,
          target: { id: 'openai:chat:gpt-4o', label: 'Imported local target', config: {
            type, ...config, stop: ['<end>'],
          } },
        });
        directlyImportedTargets[type + ':' + omission] = JSON.parse(JSON.stringify(
          getUnifiedConfig(useRedTeamConfig.getState().config).targets[0]
        ));
      }
    }
    console.log(JSON.stringify({ initialConfigs, persistedTargets, destinationTargets, directlyImportedTargets }));
  `;
  ({ initialConfigs, persistedTargets, destinationTargets, directlyImportedTargets } = JSON.parse(
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      env: {
        ...process.env,
        TSX_TSCONFIG_PATH: fileURLToPath(
          new URL('../../src/app/tsconfig.app.json', import.meta.url),
        ),
      },
    }),
  ));
});

function initialConfig(providerType: string) {
  const config = initialConfigs[providerType];
  if (!config) {
    throw new Error(`No initial configuration for ${providerType}`);
  }
  return structuredClone(config);
}

const chatResponse = {
  data: {
    choices: [
      { message: { role: 'assistant', content: 'Hello from the fixture' }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
  },
  cached: false,
  status: 200,
  statusText: 'OK',
};

let restoreEnv: () => void;
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset().mockResolvedValue(chatResponse);
  send.mockReset();
  subscribe.mockReset();
  restoreEnv = mockProcessEnv({
    OPENAI_API_KEY: 'unrelated-openai-key',
    OPENAI_API_HOST: undefined,
    OPENAI_API_BASE_URL: undefined,
    OPENAI_BASE_URL: undefined,
    MISSING_LOCAL_KEY: undefined,
    LOCAL_MODEL_KEY: 'selected-local-key',
    LLAMA_BASE_URL: 'http://127.0.0.1:8099',
    HF_TOKEN: 'test-hf-token',
    TOGETHER_API_KEY: 'test-together-key',
    DEEPSEEK_API_KEY: 'test-deepseek-key',
    GROQ_API_KEY: 'test-groq-key',
    CEREBRAS_API_KEY: 'test-cerebras-key',
    CLOUDFLARE_ACCOUNT_ID: 'test-account',
    CLOUDFLARE_API_KEY: 'test-cloudflare-key',
    DATABRICKS_WORKSPACE_URL: 'https://workspace.example.invalid',
    DATABRICKS_TOKEN: 'test-databricks-token',
    FAL_KEY: 'test-fal-key',
  });
});
afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe('redteam UI initial target runtime contracts', () => {
  it.each([
    [
      'together',
      'OpenAiChatCompletionProvider',
      'https://api.together.xyz/v1/chat/completions',
      'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    ],
    [
      'huggingface',
      'HuggingfaceChatCompletionProvider',
      'https://router.huggingface.co/v1/chat/completions',
      'meta-llama/Meta-Llama-3-70B-Instruct',
    ],
    [
      'cloudflare-ai',
      'CloudflareAiChatCompletionProvider',
      'https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1/chat/completions',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    ],
    [
      'databricks',
      'DatabricksMosaicAiChatCompletionProvider',
      'https://workspace.example.invalid/serving-endpoints/chat/completions',
      'databricks-meta-llama-3-3-70b-instruct',
    ],
    [
      'deepseek',
      'DeepSeekProvider',
      'https://api.deepseek.com/v1/chat/completions',
      'deepseek-v4-flash',
    ],
    [
      'groq',
      'GroqProvider',
      'https://api.groq.com/openai/v1/chat/completions',
      'openai/gpt-oss-120b',
    ],
    ['cerebras', 'CerebrasProvider', 'https://api.cerebras.ai/v1/chat/completions', 'gpt-oss-120b'],
  ])(
    'routes %s through its chat adapter and emits its model',
    async (type, className, url, model) => {
      const target = initialConfig(type);
      const provider = await loadApiProvider(target.id, { options: target });
      expect(provider.constructor.name).toBe(className);
      const result = await provider.callApi('Say hello');
      expect(result.output).toBe('Hello from the fixture');
      expect(result.tokenUsage).toMatchObject({ prompt: 3, completion: 5, total: 8 });
      const [requestUrl, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(requestUrl).toBe(url);
      expect(JSON.parse(request!.body as string)).toMatchObject({
        model,
        messages: [{ role: 'user', content: 'Say hello' }],
      });
      expect(request!.headers).not.toMatchObject({ Authorization: 'Bearer unrelated-openai-key' });
      if (type === 'deepseek') {
        expect(JSON.parse(request!.body as string).thinking).toEqual({ type: 'disabled' });
      }
    },
  );

  it.each(
    ['llamafile', 'vllm', 'text-generation-webui'].flatMap((type) =>
      [
        'all',
        'endpoint',
        'defaultKey',
        'requiredKey',
        'inline',
        'named',
        'optIn',
        'missingNamed',
        'requiredMissingNamed',
        'host',
      ].map((omission) => ({ type, omission })),
    ),
  )(
    'dispatches the directly imported $type/$omission export offline',
    async ({ type, omission }) => {
      const target = directlyImportedTargets[`${type}:${omission}`];
      expect(target.id).toBe('openai:chat:gpt-4o');
      const provider = await loadApiProvider(target.id, { options: target });
      if (omission === 'requiredMissingNamed') {
        await expect(provider.callApi('Offline direct import')).rejects.toThrow(
          'API key is not set. Set the MISSING_LOCAL_KEY environment variable or add `apiKey` to the provider config.',
        );
        expect(fetchWithCache).not.toHaveBeenCalled();
        return;
      }
      const result = await provider.callApi('Offline direct import');
      expect(result.output).toBe('Hello from the fixture');
      expect(fetchWithCache).toHaveBeenCalledTimes(1);
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      const expectedBase =
        omission === 'host'
          ? 'https://preferred.example.test/tenant/v1'
          : ['defaultKey', 'requiredKey'].includes(omission)
            ? 'https://custom.example.test/v1'
            : initialConfigs[type].config.apiBaseUrl;
      expect(url).toBe(`${expectedBase}/chat/completions`);
      const expectedKey =
        omission === 'inline'
          ? 'synthetic-inline-key'
          : omission === 'named'
            ? 'selected-local-key'
            : omission === 'optIn'
              ? 'unrelated-openai-key'
              : undefined;
      if (expectedKey) {
        expect(request!.headers).toMatchObject({ Authorization: `Bearer ${expectedKey}` });
      } else {
        expect(request!.headers).not.toHaveProperty('Authorization');
      }
      const body = JSON.parse(request!.body as string);
      expect(body).toMatchObject({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Offline direct import' }],
        stop: ['<end>'],
      });
      expect(body).not.toHaveProperty('type');
    },
  );

  it.each(['llamafile', 'vllm', 'text-generation-webui'])(
    'uses %s local chat settings without inheriting hosted credentials',
    async (type) => {
      const target = initialConfig(type);
      const provider = await loadApiProvider(target.id, { options: target });
      expect(provider.constructor.name).toBe('OpenAiChatCompletionProvider');
      const result = await provider.callApi('Say hello');
      expect(result.output).toBe('Hello from the fixture');
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe(`${target.config.apiBaseUrl}/chat/completions`);
      expect(request!.headers).not.toHaveProperty('Authorization');
      expect(JSON.parse(request!.body as string).model).toBe(
        target.id.slice('openai:chat:'.length),
      );
      expect(JSON.parse(request!.body as string)).not.toHaveProperty('type');
    },
  );

  it.each(['llamafile', 'vllm', 'text-generation-webui'])(
    'preserves %s served names, connections and JSON options without transmitting UI metadata',
    async (type) => {
      const target = initialConfig(type);
      target.id = 'openai:chat:tenant/models/local:quantized';
      target.config.apiBaseUrl = 'http://127.0.0.1:8999/custom/v1';
      target.config.apiKey = 'local-server-key';
      target.config.stop = ['<end>'];
      target.config.passthrough = { chat_template_kwargs: { enable_thinking: false } };
      // Saved/exported configs must load with the same runtime and wire contract.
      const savedTarget = JSON.parse(JSON.stringify(target));
      const provider = await loadApiProvider(savedTarget.id, { options: savedTarget });
      expect(provider.constructor.name).toBe('OpenAiChatCompletionProvider');
      await provider.callApi('Say hello');
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe('http://127.0.0.1:8999/custom/v1/chat/completions');
      expect(request!.headers).toMatchObject({ Authorization: 'Bearer local-server-key' });
      const body = JSON.parse(request!.body as string);
      expect(body).toMatchObject({
        model: 'tenant/models/local:quantized',
        stop: ['<end>'],
        chat_template_kwargs: { enable_thinking: false },
      });
      expect(body).not.toHaveProperty('type');
    },
  );

  it.each(
    ['llamafile', 'vllm', 'text-generation-webui'].flatMap((type) =>
      ['none', 'inline', 'selected'].map((auth) => ({ type, auth })),
    ),
  )(
    'keeps $type credentials isolated after real store rehydration ($auth)',
    async ({ type, auth }) => {
      const target = persistedTargets[`${type}:${auth}`];
      expect(target.config).not.toHaveProperty('apiKey');
      if (auth === 'inline') {
        vi.mocked(fetchWithCache).mockResolvedValue({
          data: { error: { message: 'Local credentials required' } },
          cached: false,
          status: 401,
          statusText: 'Unauthorized',
        });
      }
      const provider = await loadApiProvider(target.id, { options: target });
      const result = await provider.callApi('Say hello');
      if (auth === 'inline') {
        expect(result.error).toContain('Local credentials required');
      } else {
        expect(result.output).toBe('Hello from the fixture');
      }
      const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
      expect(url).toBe(`${target.config.apiBaseUrl}/chat/completions`);
      if (auth === 'selected') {
        expect(request!.headers).toMatchObject({ Authorization: 'Bearer selected-local-key' });
      } else {
        expect(request!.headers).not.toHaveProperty('Authorization');
      }
      expect(JSON.parse(request!.body as string)).toMatchObject({
        model: 'tenant/private-served-model:Q4_K_M',
        stop: ['<end>'],
      });
    },
  );

  it.each(['llamafile', 'vllm', 'text-generation-webui'])(
    'loads a persisted %s target without any OpenAI key',
    async (type) => {
      const restoreKeys = mockProcessEnv({ OPENAI_API_KEY: undefined });
      try {
        const target = persistedTargets[`${type}:none`];
        const provider = await loadApiProvider(target.id, { options: target });
        expect(await provider.callApi('Use the local server without an API key')).toMatchObject({
          output: 'Hello from the fixture',
        });
        const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
        expect(url).toBe(`${target.config.apiBaseUrl}/chat/completions`);
        expect(request!.headers).not.toHaveProperty('Authorization');
      } finally {
        restoreKeys();
      }
    },
  );

  it.each(
    ['llamafile', 'vllm', 'text-generation-webui'].flatMap((type) =>
      [
        'omitted',
        'empty',
        'whitespace',
        'null',
        'custom',
        'host',
        'hostPriority',
        'nativeHostPriority',
      ].map((endpoint) => ({
        type,
        endpoint,
      })),
    ),
  )(
    'keeps the $type request destination local or explicit after JSON replacement ($endpoint)',
    async ({ type, endpoint }) => {
      const restoreEndpointEnv = mockProcessEnv({
        OPENAI_API_HOST: 'ambient-openai.example.test',
        OPENAI_API_BASE_URL: 'https://ambient-base.example.test/v1',
        OPENAI_BASE_URL: 'https://ambient-alias.example.test/v1',
      });
      try {
        const target = destinationTargets[`${type}:${endpoint}`];
        const provider = await loadApiProvider(target.id, { options: target });
        expect((await provider.callApi('Keep this prompt on the selected server')).output).toBe(
          'Hello from the fixture',
        );
        const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
        const configuredBases: Record<string, string> = {
          custom: 'https://local-deployment.example.test/custom/v1',
          host: 'https://local-host.example.test/v1',
          hostPriority: 'https://local-host.example.test/tenant/v1',
          nativeHostPriority: 'https://api.openai.com/v1',
        };
        const expectedBase = configuredBases[endpoint] ?? initialConfigs[type].config.apiBaseUrl;
        expect(url).toBe(`${expectedBase}/chat/completions`);
        expect(request!.headers).toMatchObject({ Authorization: 'Bearer selected-local-key' });
        expect(JSON.parse(request!.body as string)).toMatchObject({
          model: 'tenant/private-served-model:Q4_K_M',
          max_tokens: 100,
          messages: [{ role: 'user', content: 'Keep this prompt on the selected server' }],
        });
      } finally {
        restoreEndpointEnv();
      }
    },
  );

  it('passes the Groq editor token cap through the actual chat request', async () => {
    const target = initialConfig('groq');
    target.config.max_tokens = 100;
    const provider = await loadApiProvider(target.id, { options: target });
    await provider.callApi('Say hello');
    const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', max_completion_tokens: 100 });
    expect(body).not.toHaveProperty('max_tokens');
  });

  it.each([
    {
      model: 'openai/gpt-oss-120b',
      passthrough: { model: 'llama-3.3-70b-versatile' },
      expected: { max_tokens: 100 },
    },
    {
      model: 'openai/gpt-oss-120b',
      passthrough: { model: 'openai/gpt-oss-20b', max_tokens: 500 },
      expected: { max_completion_tokens: 500 },
    },
    {
      model: 'llama-3.3-70b-versatile',
      passthrough: { model: 'qwen/qwen3.6-27b' },
      expected: { max_completion_tokens: 100 },
    },
    {
      model: 'llama-3.3-70b-versatile',
      maxCompletionTokens: 40,
      passthrough: { model: 'openai/gpt-oss-120b', max_tokens: 500 },
      expected: { max_completion_tokens: 40 },
    },
    {
      model: 'openai/gpt-oss-120b',
      maxCompletionTokens: 40,
      passthrough: {
        model: 'qwen/qwen3.6-27b',
        max_tokens: 500,
        max_completion_tokens: 20,
      },
      expected: { max_completion_tokens: 20 },
    },
    {
      model: 'llama-3.3-70b-versatile',
      maxCompletionTokens: 0,
      passthrough: { model: 'qwen/qwen3.6-27b', max_tokens: 500 },
      expected: { max_completion_tokens: 0 },
    },
    {
      model: 'openai/gpt-oss-120b',
      passthrough: { max_tokens: 0 },
      expected: { max_completion_tokens: 0 },
    },
  ])(
    'applies Groq token precedence to the effective request model ($model, $passthrough)',
    async ({ model, maxCompletionTokens, passthrough, expected }) => {
      const target = initialConfig('groq');
      target.id = `groq:${model}`;
      target.config = {
        ...target.config,
        max_tokens: 100,
        max_completion_tokens: maxCompletionTokens,
        passthrough,
      };
      const provider = await loadApiProvider(target.id, { options: target });
      expect(provider.constructor.name).toBe('GroqProvider');
      expect(await provider.callApi('Say hello')).toMatchObject({
        output: 'Hello from the fixture',
        tokenUsage: { total: 8 },
      });
      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]!.body as string);
      expect(body).toMatchObject({ model: passthrough.model ?? model, ...expected });
      expect(body).not.toHaveProperty(
        'max_tokens' in expected ? 'max_completion_tokens' : 'max_tokens',
      );
    },
  );

  it.each([
    'together',
    'huggingface',
    'cloudflare-ai',
    'databricks',
    'deepseek',
    'groq',
    'cerebras',
    'llamafile',
    'vllm',
    'text-generation-webui',
  ])('surfaces a rejected %s request', async (type) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Unknown served model' } },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });
    const target = initialConfig(type);
    const provider = await loadApiProvider(target.id, { options: target });
    const result = await provider.callApi('Say hello');
    expect(result.error).toContain('Unknown served model');
    expect(result.output).toBeUndefined();
  });

  it('uses the native llama.cpp completion API and LLAMA_BASE_URL', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: { content: 'Native fixture' },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const target = initialConfig('llama.cpp');
    const provider = await loadApiProvider(target.id, { options: target });
    expect(provider.constructor.name).toBe('LlamaProvider');
    expect(await provider.callApi('Say hello')).toMatchObject({ output: 'Native fixture' });
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8099/completion');
    expect(JSON.parse(request!.body as string)).toMatchObject({
      prompt: 'Say hello',
      n_predict: 1024,
    });
    expect(request!.headers).not.toHaveProperty('Authorization');
  });

  it('uses the modest Ollama tag on the completion API', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data: JSON.stringify({
        response: 'Local fixture',
        done: true,
        eval_count: 5,
        prompt_eval_count: 3,
      }),
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const target = initialConfig('ollama');
    const provider = await loadApiProvider(target.id, { options: target });
    expect(provider.constructor.name).toBe('OllamaCompletionProvider');
    expect(await provider.callApi('Say hello')).toMatchObject({ output: 'Local fixture' });
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/generate');
    expect(JSON.parse(request!.body as string)).toMatchObject({
      model: 'llama3.2:3b',
      prompt: 'Say hello',
    });
  });

  it('invokes the selected Bedrock agent and alias instead of a foundation model', async () => {
    send.mockResolvedValue({
      completion: (async function* () {
        yield { chunk: { bytes: new TextEncoder().encode('Agent fixture') } };
      })(),
    });
    const target = initialConfig('bedrock-agent');
    target.id = 'bedrock:agents:AGENT12345';
    target.config.agentAliasId = 'ALIAS12345';
    const provider = await loadApiProvider(target.id, { options: target });
    expect(provider.constructor.name).toBe('AwsBedrockAgentsProvider');
    expect(await provider.callApi('Say hello')).toMatchObject({ output: 'Agent fixture' });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].constructor.name).toBe('InvokeAgentCommand');
    expect(send.mock.calls[0][0].input).toMatchObject({
      agentId: 'AGENT12345',
      agentAliasId: 'ALIAS12345',
      inputText: 'Say hello',
    });
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('reports a missing Bedrock agent alias before an SDK request', async () => {
    const target = initialConfig('bedrock-agent');
    delete target.config.agentAliasId;
    const provider = await loadApiProvider(target.id, { options: target });
    expect(await provider.callApi('Say hello')).toMatchObject({
      error: expect.stringContaining('Agent Alias ID is required'),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('routes Fal to image generation and returns the image response', async () => {
    subscribe.mockResolvedValue({
      data: { images: [{ url: 'https://fixture.invalid/image.png' }] },
    });
    const target = initialConfig('fal');
    const provider = await loadApiProvider(target.id, { options: target });
    expect(provider.constructor.name).toBe('FalImageGenerationProvider');
    expect(await provider.callApi('A blue circle')).toMatchObject({
      output: '![A blue circle](https://fixture.invalid/image.png)',
    });
    expect(subscribe).toHaveBeenCalledWith('fal-ai/flux/dev', {
      input: expect.objectContaining({ prompt: 'A blue circle' }),
    });
  });

  it('preserves an arbitrary Databricks deployment name in the chat request', async () => {
    const target = initialConfig('databricks');
    target.id = 'databricks:our-private-endpoint';
    const provider = await loadApiProvider(target.id, { options: target });
    await provider.callApi('Say hello');
    expect(JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]!.body as string).model).toBe(
      'our-private-endpoint',
    );
  });
});
