import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { AnthropicMessagesProvider } from '../../src/providers/anthropic/messages';
import { loadApiProvider } from '../../src/providers/index';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/util/fetch/index')>()),
  fetchWithProxy: vi.fn(),
}));
vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/cache')>()),
  isCacheEnabled: () => false,
}));

const cloudPath = 'promptfoo://provider/00000000-0000-0000-0000-000000000001';
let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({
    FIXTURE_MARKER: 'shell-fixture',
    PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS: undefined,
    PROMPTFOO_DISABLE_TEMPLATING: undefined,
    PROMPTFOO_SELF_HOSTED: undefined,
  });
  vi.spyOn(cloudConfig, 'isEnabled').mockReturnValue(true);
  vi.spyOn(cloudConfig, 'getApiHost').mockReturnValue('https://cloud.example.invalid');
  vi.spyOn(cloudConfig, 'getAuthHeaders').mockReturnValue({ Authorization: 'Bearer fixture' });
  vi.mocked(fetchWithProxy).mockReset();
});
afterEach(() => {
  restoreEnv();
  vi.mocked(fetchWithProxy).mockReset();
  vi.restoreAllMocks();
});

function cloudProvider(config: Record<string, unknown>) {
  vi.mocked(fetchWithProxy).mockResolvedValue(Response.json({ config }));
  return loadApiProvider(cloudPath);
}

describe('saved cloud provider environment parsing', () => {
  it.each(['PROMPTFOO_DISABLE_TEMPLATE_ENV_VARS', 'PROMPTFOO_DISABLE_TEMPLATING'])(
    'retains %s through the real cloud parser before rendering',
    async (flag) => {
      for (const disabled of [true, false]) {
        const provider = await cloudProvider({
          id: 'huggingface:chat:fixture-model',
          config: { apiKey: '{{env.FIXTURE_MARKER}}' },
          env: { [flag]: String(disabled) },
        });
        expect(Reflect.get(provider, 'getApiKey').call(provider)).toBe(
          disabled ? '{{env.FIXTURE_MARKER}}' : 'shell-fixture',
        );
      }
    },
  );

  it.each([
    ['0.42', 0.42],
    ['0', 0],
    ['', 0],
  ] as const)('retains parsed temperature %j in the SDK request', async (temperature, expected) => {
    await cliState.withEnv({ ANTHROPIC_TEMPERATURE: '0.9' }, async () => {
      const provider = (await cloudProvider({
        id: 'anthropic:messages:claude-sonnet-4-6',
        config: { apiKey: 'fixture' },
        env: { ANTHROPIC_TEMPERATURE: temperature },
      })) as AnthropicMessagesProvider;
      const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
        id: 'fixture',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'fixture' }],
        model: 'claude-sonnet-4-6',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      } as Awaited<ReturnType<typeof provider.anthropic.messages.create>>);
      await provider.callApi('fixture');
      expect(create.mock.calls[0][0].temperature).toBe(expected);
    });
  });
});
