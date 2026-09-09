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
  const storeUrl = new URL('../../src/app/src/stores/evalConfig.ts', import.meta.url);
  const script = `
    const { getProviderInitialConfig } = await import(${JSON.stringify(helperUrl.href)});
    const initialConfigs = Object.fromEntries(
      ${JSON.stringify(providerTypes)}.map(type => [type, getProviderInitialConfig(type)])
    );
    const storage = new Map();
    globalThis.localStorage = {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    };
    globalThis.window = { localStorage: globalThis.localStorage };
    const { useStore } = await import(${JSON.stringify(storeUrl.href)});
    const persistedTargets = {};
    for (const type of ['llamafile', 'vllm', 'text-generation-webui']) {
      for (const [auth, config] of Object.entries({
        none: {},
        inline: { apiKey: 'private-session-key' },
        selected: { apiKeyEnvar: 'LOCAL_MODEL_KEY' },
      })) {
        const target = structuredClone(initialConfigs[type]);
        target.id = 'openai:chat:tenant/private-served-model:Q4_K_M';
        target.config = { ...target.config, ...config, stop: ['<end>'] };
        useStore.getState().setConfig({ providers: [target] });
        const saved = localStorage.getItem('promptfoo');
        useStore.setState({ config: {} });
        localStorage.setItem('promptfoo', saved);
        await useStore.persist.rehydrate();
        persistedTargets[type + ':' + auth] = useStore.getState().config.providers[0];
      }
    }
    console.log(JSON.stringify({ initialConfigs, persistedTargets }));
  `;
  ({ initialConfigs, persistedTargets } = JSON.parse(
    execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
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
