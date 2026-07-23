import path from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../src/esm';
import { mockProcessEnv } from '../util/utils';

type EjentumProviderConstructor = new (options?: {
  config?: Record<string, unknown>;
  env?: Record<string, string | undefined>;
}) => {
  callApi(
    prompt: string,
    context?: { prompt?: { config?: Record<string, unknown> } },
  ): Promise<unknown>;
};

let EjentumAugmentedProvider: EjentumProviderConstructor;

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe('baseline-vs-ejentum-harness provider', () => {
  let restoreEnv: (() => void) | undefined;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    EjentumAugmentedProvider = (await importModule(
      path.resolve('examples/baseline-vs-ejentum-harness/provider.mjs'),
    )) as EjentumProviderConstructor;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    restoreEnv = mockProcessEnv(
      {
        EJENTUM_API_KEY: 'ejentum-key',
        OPENAI_API_KEY: 'openai-key',
      },
      { clear: true },
    );
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
    vi.unstubAllGlobals();
  });

  it('returns an error without calling OpenAI when the requested scaffold is missing', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse([{}]));

    const provider = new EjentumAugmentedProvider({ config: { mode: 'reasoning' } });
    const result = await provider.callApi('solve this');

    expect(result).toEqual({
      error: 'Ejentum API response did not include a non-empty "reasoning" scaffold.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns an error when OpenAI omits non-empty assistant content', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: {} }] }));

    const provider = new EjentumAugmentedProvider({
      config: { reasoning_effort: 'none', verbosity: 'low' },
    });
    const result = await provider.callApi('solve this');

    expect(result).toEqual({
      error: 'OpenAI response did not include non-empty assistant content.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('uses current model options and returns a successful completion', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(
        mockResponse({
          choices: [{ message: { content: 'answer' } }],
          usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
        }),
      );

    const provider = new EjentumAugmentedProvider({
      config: { reasoning_effort: 'none', verbosity: 'low' },
    });
    const result = await provider.callApi('solve this');
    const openaiRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(openaiRequest).toMatchObject({
      model: 'gpt-5.4-mini',
      reasoning_effort: 'none',
      verbosity: 'low',
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(openaiRequest).not.toHaveProperty('temperature');
    expect(result).toEqual({
      output: 'answer',
      tokenUsage: { prompt: 7, completion: 3, total: 10 },
    });
  });

  it('omits GPT-5-only options when configured with a regular chat model', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({
      config: { model: 'gpt-4o-mini', reasoning_effort: 'high', verbosity: 'high' },
    });
    await provider.callApi('solve this');
    const openaiRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(openaiRequest).not.toHaveProperty('reasoning_effort');
    expect(openaiRequest).not.toHaveProperty('verbosity');
    expect(openaiRequest).toMatchObject({ max_tokens: 1024, temperature: 0 });
  });

  it('does not default an o-series model to a GPT-5-only reasoning effort', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({ config: { model: 'o3' } });
    await provider.callApi('solve this');
    const openaiRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(openaiRequest).not.toHaveProperty('reasoning_effort');
    expect(openaiRequest).not.toHaveProperty('max_tokens');
    expect(openaiRequest).not.toHaveProperty('temperature');
  });

  it.each([
    'OPENAI_API_BASE_URL',
    'OPENAI_BASE_URL',
  ])('honors the standard %s environment variable', async (apiBaseEnvVar) => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv(
      {
        EJENTUM_API_KEY: 'ejentum-key',
        OPENAI_API_KEY: 'openai-key',
        [apiBaseEnvVar]: 'http://gateway.example.test/openai/v1/',
      },
      { clear: true },
    );
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider();
    await provider.callApi('solve this');

    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://gateway.example.test/openai/v1/chat/completions',
    );
  });

  it('prefers a configured OpenAI API base URL to environment fallbacks', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv(
      {
        EJENTUM_API_KEY: 'ejentum-key',
        OPENAI_API_KEY: 'openai-key',
        OPENAI_API_BASE_URL: 'http://environment.example.test/v1',
      },
      { clear: true },
    );
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({
      config: { apiBaseUrl: 'http://configured.example.test/v1/' },
    });
    await provider.callApi('solve this');

    expect(fetchMock.mock.calls[1][0]).toBe('http://configured.example.test/v1/chat/completions');
  });

  it.each([
    {
      name: 'configured apiHost',
      options: { config: { apiHost: 'configured.example.test' } },
      expected: 'https://configured.example.test/v1/chat/completions',
    },
    {
      name: 'provider env OPENAI_API_HOST',
      options: { env: { OPENAI_API_HOST: 'environment.example.test' } },
      expected: 'https://environment.example.test/v1/chat/completions',
    },
  ])('honors $name like the baseline OpenAI provider', async ({ options, expected }) => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider(options);
    await provider.callApi('solve this');

    expect(fetchMock.mock.calls[1][0]).toBe(expected);
  });

  it('reads OpenAI and Ejentum credentials and endpoint overrides from provider options', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv({}, { clear: true });
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({
      config: { apiKey: 'configured-openai-key' },
      env: {
        EJENTUM_API_KEY: 'configured-ejentum-key',
        EJENTUM_API_URL: 'http://ejentum.example.test/logicv1/',
      },
    });
    await provider.callApi('solve this');

    expect(fetchMock.mock.calls[0][0]).toBe('http://ejentum.example.test/logicv1/');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer configured-ejentum-key');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer configured-openai-key');
  });

  it('resolves a named OpenAI key environment override', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv({ EJENTUM_API_KEY: 'ejentum-key' }, { clear: true });
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({
      config: { apiKeyEnvar: 'CUSTOM_OPENAI_KEY' },
      env: { CUSTOM_OPENAI_KEY: 'custom-openai-key' },
    });
    await provider.callApi('solve this');

    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer custom-openai-key');
  });

  it('allows unauthenticated OpenAI-compatible endpoints when apiKeyRequired is false', async () => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv({ EJENTUM_API_KEY: 'ejentum-key' }, { clear: true });
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({
      config: { apiKeyRequired: false, apiBaseUrl: 'http://localhost:1234/v1' },
    });
    const result = await provider.callApi('solve this');

    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:1234/v1/chat/completions');
    expect(fetchMock.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
    expect(result).toMatchObject({ output: 'answer' });
  });

  it('forwards OpenAI organization and configured headers', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({
      config: {
        organization: 'org-configured',
        headers: { 'X-Gateway-Tenant': 'tenant-a' },
      },
    });
    await provider.callApi('solve this');

    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({
      'OpenAI-Organization': 'org-configured',
      'X-Gateway-Tenant': 'tenant-a',
    });
  });

  it('applies prompt-level provider config overrides like the baseline provider', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider({ config: { model: 'gpt-4o-mini' } });
    await provider.callApi('solve this', {
      prompt: { config: { temperature: 0.7, max_tokens: 77 } },
    });
    const openaiRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(openaiRequest).toMatchObject({ temperature: 0.7, max_tokens: 77 });
  });

  it('returns OpenAI refusal responses as guarded successful outputs', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(
        mockResponse({
          choices: [{ message: { refusal: 'I cannot assist with that.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
        }),
      );

    const result = await new EjentumAugmentedProvider().callApi('solve this');

    expect(result).toEqual({
      output: 'I cannot assist with that.',
      tokenUsage: { prompt: 7, completion: 3, total: 10 },
      isRefusal: true,
      finishReason: 'stop',
      guardrails: { flagged: true },
    });
  });

  it('returns filtered completions as guarded successful outputs', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(
        mockResponse({ choices: [{ message: {}, finish_reason: 'content_filter' }] }),
      );

    const result = await new EjentumAugmentedProvider().callApi('solve this');

    expect(result).toEqual({
      output: 'Content filtered by provider',
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      isRefusal: true,
      finishReason: 'content_filter',
      guardrails: { flagged: true },
    });
  });

  it.each([
    {
      format: 'JSON',
      prompt: JSON.stringify([
        { role: 'system', content: 'Retain this instruction.' },
        { role: 'user', content: 'Solve this task.' },
      ]),
    },
    {
      format: 'YAML',
      prompt:
        '- role: system\n  content: Retain this instruction.\n- role: user\n  content: Solve this task.',
    },
  ])('preserves $format chat message prompts while injecting the scaffold', async ({ prompt }) => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const provider = new EjentumAugmentedProvider();
    await provider.callApi(prompt);
    const openaiRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(openaiRequest.messages).toEqual([
      {
        role: 'system',
        content: expect.stringContaining('[COGNITIVE SCAFFOLD]\ncheck assumptions'),
      },
      { role: 'system', content: 'Retain this instruction.' },
      { role: 'user', content: 'Solve this task.' },
    ]);
  });

  it('keeps JSON-looking task text as one user message when it is not a chat array', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse([{ reasoning: 'check assumptions' }]))
      .mockResolvedValueOnce(mockResponse({ choices: [{ message: { content: 'answer' } }] }));

    const prompt = '{"task":"return this object"}';
    const provider = new EjentumAugmentedProvider();
    await provider.callApi(prompt);
    const openaiRequest = JSON.parse(fetchMock.mock.calls[1][1].body as string);

    expect(openaiRequest.messages).toEqual([
      {
        role: 'system',
        content: expect.stringContaining('[COGNITIVE SCAFFOLD]\ncheck assumptions'),
      },
      { role: 'user', content: prompt },
    ]);
  });
});
