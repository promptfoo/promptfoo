import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserEmail } from '../../src/globalConfig/accounts';
import logger, * as loggerModule from '../../src/logger';
import {
  PromptfooChatCompletionProvider,
  PromptfooHarmfulCompletionProvider,
} from '../../src/providers/promptfoo';
import { clearAgentCache, fetchWithRetries } from '../../src/util/fetch/index';
import { mockProcessEnv, PROXY_ENV_KEYS } from '../util/utils';

const { createDisabledCloudConfigFactory } = await vi.hoisted(
  () => import('../factories/moduleMocks'),
);

vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud', createDisabledCloudConfigFactory());

describe('harmful generation transport logging', () => {
  const secrets = {
    email: 'private-email-canary@example.test',
    purpose: 'private-purpose-canary',
    configKey: 'private-config-key-canary',
    configValue: 'private-config-value-canary',
    password: 'private-password-canary',
    path: 'private-path-canary',
    query: 'private-query-canary',
    response: 'private-response-canary',
    status: 'private-status-canary',
    error: 'private-error-canary',
  };
  const endpoint = `https://user:${secrets.password}@example.test/${secrets.path}?token=${secrets.query}`;
  let restoreEnv = () => {};
  let provider: PromptfooHarmfulCompletionProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      ...Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])),
      PROMPTFOO_UNALIGNED_INFERENCE_ENDPOINT: endpoint,
      PROMPTFOO_DISABLE_REMOTE_GENERATION: undefined,
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: undefined,
      PROMPTFOO_CA_CERT_PATH: undefined,
    });
    vi.mocked(getUserEmail).mockReturnValue(secrets.email);
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    // Keep the real request logger and fetch wrappers; intercept only the network boundary.
    vi.spyOn(loggerModule, 'logRequestResponse');
    vi.spyOn(globalThis, 'fetch');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    provider = new PromptfooHarmfulCompletionProvider({
      harmCategory: 'test-category',
      n: 1,
      purpose: secrets.purpose,
      config: { [secrets.configKey]: secrets.configValue },
    });
  });

  afterEach(async () => {
    await Promise.all(
      vi.mocked(loggerModule.logRequestResponse).mock.results.map(({ value }) => value),
    );
    clearAgentCache();
    restoreEnv();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  async function expectPrivateDiagnostics() {
    await Promise.all(
      vi.mocked(loggerModule.logRequestResponse).mock.results.map(({ value }) => value),
    );
    const logs = JSON.stringify(
      [logger.debug, logger.info, logger.warn, logger.error].flatMap(
        (method) => vi.mocked(method).mock.calls,
      ),
    );
    for (const secret of Object.values(secrets)) {
      expect(logs).not.toContain(secret);
    }
    expect(loggerModule.logRequestResponse).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      '[HarmfulCompletionProvider] Calling generate harmful API',
      expect.objectContaining({ hasEmail: true, hasConfig: true }),
    );
  }

  it('keeps request and response content out of logs while sending and returning it', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ output: secrets.response }), { status: 200 }),
    );

    const result = await provider.callApi('ignored');

    expect(result).toEqual({ output: [secrets.response] });
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fetch).mock.calls[0][1];
    expect(JSON.parse(String(request?.body))).toMatchObject({
      email: secrets.email,
      purpose: secrets.purpose,
      config: { [secrets.configKey]: secrets.configValue },
    });
    await expectPrivateDiagnostics();
  });

  it('does not log an unsuccessful HTTP response or its status text', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(secrets.response, { status: 400, statusText: secrets.status }),
    );

    const result = await provider.callApi('ignored');

    expect(result.error).toContain('status 400');
    expect(result.output).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    await expectPrivateDiagnostics();
  });

  it('does not log endpoint credentials, failure messages, or stacks when retries are exhausted', async () => {
    const error = new Error(`${secrets.error}: ${endpoint}`);
    error.stack = `Error: ${secrets.error}\n    at ${endpoint}`;
    vi.mocked(fetch).mockRejectedValue(error);

    const pending = provider.callApi('ignored');
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.error).toBe('[HarmfulCompletionProvider] Error generating harmful content');
    expect(result.output).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(3);
    await expectPrivateDiagnostics();
  });

  it.each(['success', 'exhaustion'] as const)(
    'keeps rate-limit retries private on %s',
    async (outcome) => {
      vi.mocked(fetch).mockImplementation(async () => {
        if (outcome === 'success' && vi.mocked(fetch).mock.calls.length > 1) {
          return new Response(JSON.stringify({ output: secrets.response }));
        }
        return new Response(
          JSON.stringify({ error: { message: secrets.response, code: secrets.error } }),
          {
            status: 429,
            statusText: secrets.status,
            headers: { 'Retry-After': '1' },
          },
        );
      });

      const pending = provider.callApi('ignored');
      await vi.runAllTimersAsync();
      const result = await pending;

      if (outcome === 'success') {
        expect(result).toEqual({ output: [secrets.response] });
        expect(fetch).toHaveBeenCalledTimes(2);
      } else {
        expect(result.error).toBe('[HarmfulCompletionProvider] Error generating harmful content');
        expect(result.output).toBeUndefined();
        expect(fetch).toHaveBeenCalledTimes(3);
      }
      await expectPrivateDiagnostics();
    },
  );

  it('retains request and response logging for ordinary transport calls', async () => {
    const url = 'https://example.test/ordinary';
    vi.mocked(fetch).mockResolvedValue(new Response('ordinary response'));

    const response = await fetchWithRetries(
      url,
      { method: 'POST', body: 'ordinary request' },
      1000,
      0,
    );
    await Promise.all(
      vi.mocked(loggerModule.logRequestResponse).mock.results.map(({ value }) => value),
    );

    expect(await response.text()).toBe('ordinary response');
    expect(loggerModule.logRequestResponse).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ url, requestBody: 'ordinary request', response }),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Api Request',
      expect.objectContaining({
        requestBody: 'ordinary request',
        response: 'ordinary response',
      }),
    );
  });
});

describe('chat completion rate-limit responses through the transport', () => {
  const tokenUsage = { total: 23, prompt: 15, completion: 8, numRequests: 2 };
  let restoreEnv = () => {};
  let provider: PromptfooChatCompletionProvider;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({
      ...Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])),
      PROMPTFOO_REMOTE_GENERATION_URL: 'https://example.test/chat',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: undefined,
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: undefined,
      PROMPTFOO_CA_CERT_PATH: undefined,
    });
    vi.mocked(getUserEmail).mockReturnValue('chat-test@example.test');
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(loggerModule, 'logRequestResponse');
    vi.spyOn(globalThis, 'fetch');
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.useFakeTimers();
    provider = new PromptfooChatCompletionProvider({
      jsonOnly: false,
      preferSmallModel: false,
      task: 'iterative',
    });
  });

  afterEach(async () => {
    await Promise.all(
      vi.mocked(loggerModule.logRequestResponse).mock.results.map(({ value }) => value),
    );
    clearAgentCache();
    restoreEnv();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it.each([true, false])(
    'preserves refusal and token usage after exhausted 429 retries (remote error: %s)',
    async (hasRemoteError) => {
      vi.mocked(fetch).mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            ...(hasRemoteError ? { error: 'Remote request limit reached' } : {}),
            result: 'stale result must not be returned',
            isRefusal: true,
            tokenUsage,
          }),
          { status: 429, headers: { 'Retry-After': '1' } },
        );
      });

      const pending = provider.callApi('test prompt');
      await vi.runAllTimersAsync();
      const result = await pending;

      expect(fetch).toHaveBeenCalledTimes(5);
      expect(result).toEqual({
        error: hasRemoteError
          ? 'Remote request limit reached'
          : 'API call error: HttpRateLimitError: Rate limit exceeded: HTTP 429 Too Many Requests',
        isRefusal: true,
        tokenUsage,
      });
      expect(result.output).toBeUndefined();
    },
  );

  it('preserves a hard-quota response without retrying', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          error: 'Remote credits exhausted',
          code: 'credit_balance_exhausted',
          result: 'stale result must not be returned',
          isRefusal: true,
          tokenUsage,
        }),
        { status: 429 },
      );
    });

    const result = await provider.callApi('test prompt');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      error: 'Remote credits exhausted',
      isRefusal: true,
      tokenUsage,
    });
    expect(result.output).toBeUndefined();
  });

  it('returns the eventual successful result after a transient 429', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Temporary request limit reached', tokenUsage }), {
          status: 429,
          headers: { 'Retry-After': '1' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: 'fresh result', tokenUsage: { total: 7 } })),
      );

    const pending = provider.callApi('test prompt');
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('fresh result');
    expect(result.tokenUsage).toEqual({ total: 7 });
  });

  it('propagates cancellation during 429 backoff without another request', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: 'Temporary request limit reached', tokenUsage }),
        {
          status: 429,
          headers: { 'Retry-After': '1' },
        },
      );
    });
    const backoffStarted = new Promise<void>((resolve) => {
      vi.mocked(logger.debug).mockImplementation((message) => {
        if (message.startsWith('Rate limited, waiting ')) {
          resolve();
        }
      });
    });
    const controller = new AbortController();
    const reason = Object.assign(new Error('Caller cancelled'), { name: 'AbortError' });
    const pending = provider.callApi('test prompt', undefined, {
      abortSignal: controller.signal,
    });
    const rejected = expect(pending).rejects.toBe(reason);

    await backoffStarted;
    controller.abort(reason);
    await rejected;
    await vi.runAllTimersAsync();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
