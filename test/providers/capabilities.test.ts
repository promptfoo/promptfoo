import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { hasFunctionToolCallValidator } from '../../src/contracts/providers';
import { getAndCheckProvider } from '../../src/matchers/providers';
import { createLiteLLMProvider, LiteLLMProvider } from '../../src/providers/litellm';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { providerRegistry } from '../../src/providers/providerRegistry';
import {
  type ApiProvider,
  hasProviderCapability,
  type ProviderIdentity,
  type ProviderOperations,
} from '../../src/types/providers';

const mcp = vi.hoisted(() => ({ initialize: vi.fn(), cleanup: vi.fn() }));
vi.mock('../../src/providers/mcp/client', () => ({
  MCPClient: class {
    initialize = mcp.initialize;
    cleanup = mcp.cleanup;
    getAllTools() {
      return [];
    }
  },
}));
vi.mock('../../src/logger');
afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
});

it('represents an embedding capability without a text operation', async () => {
  const provider: ProviderIdentity<{ dimensions: number }> &
    Pick<ProviderOperations, 'callEmbeddingApi'> = {
    id: () => 'embedding-only',
    config: { dimensions: 2 },
    callEmbeddingApi: async () => ({ embedding: [1, 2] }),
  };
  expectTypeOf(provider.config).toEqualTypeOf<{ dimensions: number } | undefined>();
  expect(hasProviderCapability(provider, 'callEmbeddingApi')).toBe(true);
  expect(hasProviderCapability(provider, 'callApi')).toBe(false);
  expect(await provider.callEmbeddingApi('hello')).toEqual({ embedding: [1, 2] });
});

it.each([undefined, null, 'not callable', 1])(
  'rejects a non-callable operation: %s',
  (callEmbeddingApi) => {
    expect(
      hasProviderCapability({ id: () => 'invalid', callEmbeddingApi }, 'callEmbeddingApi'),
    ).toBe(false);
  },
);

it('does not treat the OpenAI embedding text stub as an implemented capability', async () => {
  const provider = new OpenAiEmbeddingProvider('fixture');
  expect(hasProviderCapability(provider, 'callEmbeddingApi')).toBe(true);
  expect(hasProviderCapability(provider, 'callApi')).toBe(false);
  await expect(getAndCheckProvider('text', provider, null, 'rubric')).rejects.toThrow(
    'not a valid text provider',
  );
});

it('rejects explicitly configured undefined embedding methods before invocation', async () => {
  const provider: ApiProvider = {
    id: () => 'invalid',
    callApi: async () => ({}),
    callEmbeddingApi: undefined,
  };
  await expect(getAndCheckProvider('embedding', provider, null, 'similarity')).rejects.toThrow(
    'not a valid embedding provider',
  );
});

it('preserves legacy text capability detection', async () => {
  const provider: ApiProvider = { id: () => 'legacy', callApi: async () => ({ output: 'hello' }) };
  expect(hasProviderCapability(provider, 'callApi')).toBe(true);
  expect(await getAndCheckProvider('text', provider, null, 'rubric')).toBe(provider);
});

it('honors explicit capability restrictions even if a method exists', () => {
  const provider = { id: () => 'stub', promptfooCapabilities: [], callApi: async () => ({}) };
  expect(hasProviderCapability(provider, 'callApi')).toBe(false);
});

describe.each(['chat', 'completion', 'embedding'] as const)('LiteLLM %s forwarding', (kind) => {
  it('retains custom identifiers and provider environment overrides', () => {
    const provider = createLiteLLMProvider(`litellm:${kind}:fixture`, {
      id: 'outer-id',
      env: { LITELLM_API_KEY: 'outer-key' },
      config: { id: 'custom-id', env: { LITELLM_API_KEY: 'scoped-key' } },
    });
    expect(provider.id()).toBe('custom-id');
    const getApiKey = (provider as LiteLLMProvider).getApiKey;
    expect(getApiKey()).toBe('scoped-key');
    expect(createLiteLLMProvider(`litellm:${kind}:fixture`, { id: 'outer-id' }).id()).toBe(
      'outer-id',
    );
  });

  it('forwards context and options to the bound operation', async () => {
    const context = { prompt: { raw: 'hello', label: 'hello' }, vars: {}, bustCache: true };
    const options = { abortSignal: new AbortController().signal };
    const delegate = kind === 'chat' ? OpenAiChatCompletionProvider : OpenAiCompletionProvider;
    const spy =
      kind === 'embedding'
        ? vi
            .spyOn(OpenAiEmbeddingProvider.prototype, 'callEmbeddingApi')
            .mockResolvedValue({ embedding: [1] })
        : vi.spyOn(delegate.prototype, 'callApi').mockResolvedValue({ output: 'hello' });
    const provider = createLiteLLMProvider(`litellm:${kind}:fixture`);
    if (hasProviderCapability(provider, 'callEmbeddingApi')) {
      await provider.callEmbeddingApi('hello', context, options);
    } else {
      await provider.callApi('hello', context, options);
    }
    expect(spy).toHaveBeenCalledWith('hello', context, options);
    expect(spy.mock.contexts[0]).toBeInstanceOf(
      kind === 'embedding' ? OpenAiEmbeddingProvider : delegate,
    );
    expect(hasProviderCapability(provider, 'callApi')).toBe(kind !== 'embedding');
  });
});

it('forwards cleanup and function validation with the delegate as receiver', async () => {
  const cleanup = vi
    .spyOn(OpenAiChatCompletionProvider.prototype, 'cleanup')
    .mockResolvedValue(undefined);
  const validate = vi
    .spyOn(OpenAiChatCompletionProvider.prototype, 'validateFunctionToolCall')
    .mockImplementation(() => undefined);
  const provider = new LiteLLMProvider('fixture', { id: 'custom' });
  expect(hasFunctionToolCallValidator(provider)).toBe(true);
  provider.validateFunctionToolCall!('{}', { value: 'fixture' });
  await providerRegistry.withScope([provider], async () => undefined);
  expect(validate).toHaveBeenCalledWith('{}', { value: 'fixture' });
  expect(cleanup).toHaveBeenCalledOnce();
  expect(validate.mock.contexts[0]).toBe(cleanup.mock.contexts[0]);
  expect(cleanup.mock.contexts[0]).toBeInstanceOf(OpenAiChatCompletionProvider);
});

it('retains MCP tools and cleanup ownership when a LiteLLM wrapper is reused', async () => {
  mcp.initialize.mockReset().mockResolvedValue(undefined);
  mcp.cleanup.mockReset().mockResolvedValue(undefined);
  vi.spyOn(OpenAiChatCompletionProvider.prototype, 'getApiKey').mockReturnValue(undefined);
  // Exercise actual delegate initialization through request preparation; the
  // transport is never reached because the fixture has no credential.
  const provider = new LiteLLMProvider('fixture', {
    config: { apiKeyRequired: true, apiKeyEnvar: 'UNSET_FIXTURE_KEY', mcp: { enabled: true } },
  });
  for (let run = 0; run < 2; run++) {
    await expect(
      providerRegistry.withScope([provider], () => provider.callApi('hello')),
    ).rejects.toThrow('API key');
  }
  expect(mcp.initialize).toHaveBeenCalledTimes(2);
  expect(mcp.cleanup).toHaveBeenCalledTimes(2);
});

it.each([{ streaming: true }, ['vision'], []])(
  'retains legacy custom capabilities metadata %j',
  (capabilities) => {
    const provider = {
      id: () => 'legacy-metadata',
      capabilities,
      callApi: async () => ({ output: 'hello' }),
    };
    expect(hasProviderCapability(provider, 'callApi')).toBe(true);
  },
);
