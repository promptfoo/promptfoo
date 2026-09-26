import {
  Agent,
  type Model,
  OpenAIProvider,
  setDefaultModelProvider,
  setTracingDisabled,
  Usage,
} from '@openai/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { OpenAiAgentsProvider } from '../../../src/providers/openai/agents';
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

  it('rejects an explicitly masked key instead of using host credentials', async () => {
    await expect(provider({}, { OPENAI_API_KEY: '' }).callApi('hello')).rejects.toThrow(
      /Missing credentials/,
    );
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });
});
