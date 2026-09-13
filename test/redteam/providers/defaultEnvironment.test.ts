import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { getEnvOverrides, withEnvOverrides } from '../../../src/envOverrides';
import { resetDefaultProviders, setDefaultRedteamProviders } from '../../../src/providers/defaults';
import { MistralChatCompletionProvider } from '../../../src/providers/mistral';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import RedteamIterativeProvider from '../../../src/redteam/providers/iterative';
import { redteamProviderManager } from '../../../src/redteam/providers/shared';
import { clearAgentCache } from '../../../src/util/fetch';
import { createMockProvider } from '../../factories/provider';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal()),
  hasGoogleDefaultCredentials: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../src/providers/openai/codexDefaults', async (importOriginal) => ({
  ...(await importOriginal()),
  hasCodexDefaultCredentials: vi.fn().mockReturnValue(false),
}));

describe('automatic redteam provider call environment', () => {
  const originalEnv = { ...process.env };
  const originalConfig = cliState.config;
  const requests: { url: string; authorization: string | null; body: any }[] = [];

  beforeEach(() => {
    mockProcessEnv(
      {
        PATH: originalEnv.PATH,
        HOME: originalEnv.HOME,
        NODE_ENV: 'test',
        PROMPTFOO_DISABLE_TELEMETRY: 'true',
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        PROMPTFOO_CACHE_ENABLED: 'false',
      },
      { clear: true },
    );
    cliState.config = {};
    redteamProviderManager.clearProvider();
    resetDefaultProviders();
    requests.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options) => {
        requests.push({
          url: String(url),
          authorization: new Headers(options.headers).get('authorization'),
          body: JSON.parse(options.body),
        });
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'fixture result' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
  });

  afterEach(() => {
    clearAgentCache();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetDefaultProviders();
    redteamProviderManager.clearProvider();
    cliState.config = originalConfig;
    mockProcessEnv(originalEnv, { clear: true });
  });

  it.each([
    ['OPENAI_API_KEY', OpenAiChatCompletionProvider, 'https://api.openai.com/v1'],
    ['MISTRAL_API_KEY', MistralChatCompletionProvider, 'https://api.mistral.ai/v1'],
  ] as const)(
    'keeps %s credentials and endpoint together for plain and JSON calls',
    async (key, Provider, endpoint) => {
      cliState.config = { env: { [key]: 'fixture-a' } };
      const providers = await Promise.all(
        [false, true].map((jsonOnly) => redteamProviderManager.getProvider({ jsonOnly })),
      );
      cliState.config = {
        env: {
          [key]: 'fixture-b',
          OPENAI_API_BASE_URL: 'https://unrelated.invalid/v1',
          MISTRAL_API_BASE_URL: 'https://unrelated.invalid/v1',
        },
      };

      for (const provider of providers) {
        expect(provider).toBeInstanceOf(Provider);
        expect((await provider.callApi('inert fixture')).output).toBe('fixture result');
      }

      expect(requests.map(({ url, authorization }) => ({ url, authorization }))).toEqual([
        { url: `${endpoint}/chat/completions`, authorization: 'Bearer fixture-a' },
        { url: `${endpoint}/chat/completions`, authorization: 'Bearer fixture-a' },
      ]);
      expect(requests[0].body.response_format).toBeUndefined();
      expect(requests[1].body.response_format).toEqual({ type: 'json_object' });
      expect(getEnvOverrides()).toBe(cliState.config.env);
    },
  );

  it('retains a captured endpoint and process fallback across another request scope', async () => {
    mockProcessEnv({ OPENAI_API_BASE_URL: 'https://process-fixture.invalid/v1' });
    const first = await withEnvOverrides({ OPENAI_API_KEY: 'fixture-a' }, () =>
      redteamProviderManager.getProvider({ ignoreCliState: true }),
    );
    const second = await withEnvOverrides(
      {
        OPENAI_API_KEY: 'fixture-b',
        OPENAI_API_BASE_URL: 'https://captured-fixture.invalid/v1',
      },
      () => redteamProviderManager.getProvider({ ignoreCliState: true }),
    );

    await withEnvOverrides({ OPENAI_API_BASE_URL: 'https://later.invalid/v1' }, async () => {
      await Promise.all([first.callApi('first'), second.callApi('second')]);
      expect(getEnvOverrides()?.OPENAI_API_BASE_URL).toBe('https://later.invalid/v1');
    });
    expect(requests.map(({ url }) => url).sort()).toEqual([
      'https://captured-fixture.invalid/v1/chat/completions',
      'https://process-fixture.invalid/v1/chat/completions',
    ]);
  });

  it('keeps the captured environment in the actual eval-time iterative call', async () => {
    cliState.config = { env: { OPENAI_API_KEY: 'fixture-a' } };
    const target = createMockProvider();
    vi.spyOn(redteamProviderManager, 'getGradingProvider').mockImplementation(async () => {
      // The attacker has already been selected, before the iterative caller invokes it.
      cliState.config = {
        env: {
          OPENAI_API_KEY: 'fixture-b',
          OPENAI_API_BASE_URL: 'https://unrelated.invalid/v1',
        },
      };
      return createMockProvider();
    });
    const iterative = new RedteamIterativeProvider({ injectVar: 'input', numIterations: 1 });
    await iterative.callApi('inert fixture', {
      prompt: { raw: '{{input}}', label: 'fixture' },
      vars: { input: 'inert fixture' },
      originalProvider: target,
    });
    // A deliberately non-JSON response ends the single fixture iteration before any target call.
    expect(target.callApi).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: 'https://api.openai.com/v1/chat/completions',
      authorization: 'Bearer fixture-a',
    });
  });

  it('preserves explicit and cached provider instances and their call methods', async () => {
    const provider = createMockProvider();
    const callApi = provider.callApi;
    await setDefaultRedteamProviders(provider);
    expect(await redteamProviderManager.getProvider({})).toBe(provider);
    expect(provider.callApi).toBe(callApi);
    resetDefaultProviders();
    expect(await redteamProviderManager.getProvider({ provider })).toBe(provider);
    await redteamProviderManager.setProvider(provider);
    expect(await redteamProviderManager.getProvider({})).toBe(provider);
    expect(provider.callApi).toBe(callApi);
  });
});
