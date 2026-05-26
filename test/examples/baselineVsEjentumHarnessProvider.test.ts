import path from 'node:path';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { importModule } from '../../src/esm';
import { mockProcessEnv } from '../util/utils';

type EjentumProviderConstructor = new (options?: {
  config?: Record<string, string>;
}) => {
  callApi(prompt: string): Promise<unknown>;
};

let EjentumAugmentedProvider: EjentumProviderConstructor;

function mockResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

describe('baseline-vs-ejentum-harness provider', () => {
  let restoreEnv: (() => void) | undefined;
  const fetchMock = vi.fn();

  beforeAll(async () => {
    EjentumAugmentedProvider = (await importModule(
      path.resolve('examples/baseline-vs-ejentum-harness/provider.js'),
    )) as EjentumProviderConstructor;
  });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    restoreEnv = mockProcessEnv({
      EJENTUM_API_KEY: 'ejentum-key',
      OPENAI_API_KEY: 'openai-key',
    });
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

    const provider = new EjentumAugmentedProvider();
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

    const provider = new EjentumAugmentedProvider();
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
  });

  it.each([
    'OPENAI_API_BASE_URL',
    'OPENAI_BASE_URL',
  ])('honors the standard %s environment variable', async (apiBaseEnvVar) => {
    restoreEnv?.();
    restoreEnv = mockProcessEnv({
      EJENTUM_API_KEY: 'ejentum-key',
      OPENAI_API_KEY: 'openai-key',
      [apiBaseEnvVar]: 'http://gateway.example.test/openai/v1/',
    });
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
    restoreEnv = mockProcessEnv({
      EJENTUM_API_KEY: 'ejentum-key',
      OPENAI_API_KEY: 'openai-key',
      OPENAI_API_BASE_URL: 'http://environment.example.test/v1',
    });
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
});
