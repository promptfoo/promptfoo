import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import { hasFunctionToolCallValidator } from '../../src/contracts/providers';
import { getAndCheckProvider } from '../../src/matchers/providers';
import { AwsBedrockEmbeddingProvider } from '../../src/providers/bedrock';
import { CohereEmbeddingProvider } from '../../src/providers/cohere';
import { createLiteLLMProvider, LiteLLMProvider } from '../../src/providers/litellm';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import {
  type ApiProvider,
  hasProviderCapability,
  type ProviderIdentity,
  type ProviderOperations,
} from '../../src/types/providers';

import type { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';

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

it.each([
  ['Bedrock', () => new AwsBedrockEmbeddingProvider('fixture')],
  ['Cohere', () => new CohereEmbeddingProvider('fixture')],
  ['Voyage', () => new VoyageEmbeddingProvider('fixture')],
])('does not treat the built-in %s text stub as an override', (_name, create) => {
  expect(hasProviderCapability(create(), 'callApi')).toBe(false);
});

it('recognizes a subclass implementation that replaces an inherited text stub', async () => {
  class TextEmbeddingProvider extends OpenAiEmbeddingProvider {
    override async callApi() {
      return { output: 'implemented by subclass' };
    }
  }
  const provider = new TextEmbeddingProvider('fixture');
  expect(hasProviderCapability(provider, 'callApi')).toBe(true);
  expect(await getAndCheckProvider('text', provider, null, 'rubric')).toBe(provider);
  expect((await provider.callApi()).output).toBe('implemented by subclass');
});

it('recognizes an override on the same prototype as its capability declaration', async () => {
  class TextEmbeddingProvider extends OpenAiEmbeddingProvider {
    static override readonly declaredProviderCapabilities = ['callEmbeddingApi'] as const;
    override async callApi() {
      return { output: 'implemented by subclass' };
    }
  }
  const provider = new TextEmbeddingProvider('fixture');
  expect(hasProviderCapability(provider, 'callApi')).toBe(true);
  expect(await getAndCheckProvider('text', provider, null, 'rubric')).toBe(provider);
});

it('recognizes a LiteLLM subclass operation with its own capability declaration', async () => {
  class EmbeddingLiteLLMProvider extends LiteLLMProvider {
    async callEmbeddingApi() {
      return { embedding: [1] };
    }
  }
  Object.defineProperty(EmbeddingLiteLLMProvider, 'declaredProviderCapabilities', {
    value: ['callEmbeddingApi'],
  });
  const provider = new EmbeddingLiteLLMProvider('fixture');
  expect(hasProviderCapability(provider, 'callEmbeddingApi')).toBe(true);
  expect(await getAndCheckProvider('embedding', provider, null, 'rubric')).toBe(provider);
});

it('recognizes an instance-owned implementation that replaces an inherited text stub', async () => {
  class TextEmbeddingProvider extends OpenAiEmbeddingProvider {
    override callApi = async () => ({ output: 'implemented on instance' });
  }
  const provider = new TextEmbeddingProvider('fixture');
  expect(hasProviderCapability(provider, 'callApi')).toBe(true);
  expect(await getAndCheckProvider('text', provider, null, 'rubric')).toBe(provider);
});

it('preserves subclass text capability through a rate-limit object wrapper', async () => {
  class TextEmbeddingProvider extends OpenAiEmbeddingProvider {
    override async callApi() {
      return { output: 'subclass text' };
    }
  }
  class RestrictedProvider extends TextEmbeddingProvider {
    override readonly promptfooCapabilities = ['callEmbeddingApi'] as const;
  }
  const registry = {
    execute: vi.fn(async (_provider: unknown, call: () => Promise<unknown>) => call()),
  } as unknown as RateLimitRegistry;
  const wrapped = wrapProviderWithRateLimiting(new TextEmbeddingProvider('fixture'), registry);
  expect(await getAndCheckProvider('text', wrapped, null, 'rubric')).toBe(wrapped);
  expect((await wrapped.callApi('hello')).output).toBe('subclass text');
  wrapped.promptfooCapabilities = ['callEmbeddingApi'];
  expect(hasProviderCapability(wrapped, 'callApi')).toBe(false);
  expect(
    hasProviderCapability(
      wrapProviderWithRateLimiting(new RestrictedProvider('fixture'), registry),
      'callApi',
    ),
  ).toBe(false);
  expect(
    hasProviderCapability(
      wrapProviderWithRateLimiting(new OpenAiEmbeddingProvider('fixture'), registry),
      'callApi',
    ),
  ).toBe(false);
  const prototypeCapabilities = Object.create({
    get promptfooCapabilities() {
      return ['callEmbeddingApi'];
    },
  }) as ApiProvider;
  prototypeCapabilities.id = () => 'prototype-embedding';
  prototypeCapabilities.callApi = vi.fn().mockRejectedValue(new Error('text stub'));
  prototypeCapabilities.callEmbeddingApi = vi.fn().mockResolvedValue({ embedding: [1] });
  const guarded = wrapProviderWithRateLimiting(prototypeCapabilities, registry);
  expect(hasProviderCapability(guarded, 'callApi')).toBe(false);
  await expect(getAndCheckProvider('text', guarded, null, 'rubric')).rejects.toThrow();
});

it('honors a subclass capability exclusion even when it replaces a stub', () => {
  class RestrictedEmbeddingProvider extends OpenAiEmbeddingProvider {
    override readonly promptfooCapabilities = ['callEmbeddingApi'] as const;
    override async callApi(): Promise<never> {
      throw new Error('The text operation remains unsupported');
    }
  }
  const provider = new RestrictedEmbeddingProvider('fixture');
  expect(hasProviderCapability(provider, 'callApi')).toBe(false);
});

it('recognizes an inherited subclass override through a second package copy', async () => {
  class CrossCopyEmbedding extends OpenAiEmbeddingProvider {
    override async callApi() {
      return { output: 'fixture text' };
    }
  }
  const provider = new CrossCopyEmbedding('fixture');
  vi.resetModules();
  const otherCopy = await import('../../src/types/providers');
  expect(otherCopy.hasProviderCapability(provider, 'callApi')).toBe(true);
});

it('honors an explicit subclass declaration that reuses the exported tuple', () => {
  class RestrictedEmbeddingProvider extends OpenAiEmbeddingProvider {
    override readonly promptfooCapabilities = OpenAiEmbeddingProvider.declaredProviderCapabilities;
    override async callApi(): Promise<never> {
      throw new Error('The text operation remains unsupported');
    }
  }
  expect(hasProviderCapability(new RestrictedEmbeddingProvider('fixture'), 'callApi')).toBe(false);
});

it('rejects an embedding-only default when a text grader is required', async () => {
  const embeddingDefault = new OpenAiEmbeddingProvider('fixture');
  await expect(getAndCheckProvider('text', undefined, embeddingDefault, 'rubric')).rejects.toThrow(
    'not a valid text provider',
  );
});

it('rechecks a distinct default after an implicit grader fails its capability check', async () => {
  const previousConfig = cliState.config;
  const implicitGrader = new OpenAiEmbeddingProvider('implicit');
  const defaultGrader = new OpenAiEmbeddingProvider('default');
  try {
    cliState.config = { defaultTest: { provider: implicitGrader } };
    await expect(getAndCheckProvider('text', undefined, defaultGrader, 'rubric')).rejects.toThrow(
      'not a valid text provider',
    );
  } finally {
    cliState.config = previousConfig;
  }
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

it('recognizes added LiteLLM subclass operations without overriding explicit exclusions', async () => {
  class ExtendedLiteLLMProvider extends LiteLLMProvider {
    async callEmbeddingApi() {
      return { embedding: [1] };
    }
  }
  class RestrictedLiteLLMProvider extends ExtendedLiteLLMProvider {
    override readonly promptfooCapabilities = ['callApi'] as const;
  }
  const provider = new ExtendedLiteLLMProvider('fixture', {});
  expect(hasProviderCapability(provider, 'callEmbeddingApi')).toBe(true);
  expect(await getAndCheckProvider('embedding', provider, null, 'similarity')).toBe(provider);
  expect(
    hasProviderCapability(new RestrictedLiteLLMProvider('fixture', {}), 'callEmbeddingApi'),
  ).toBe(false);
});

it('preserves prototype lifecycle and validation hooks on LiteLLM subclasses', async () => {
  const cleanup = vi.fn().mockResolvedValue(undefined);
  const validateFunctionToolCall = vi.fn();
  class CustomLiteLLMProvider extends LiteLLMProvider {}
  Object.defineProperties(CustomLiteLLMProvider.prototype, {
    cleanup: { value: cleanup },
    validateFunctionToolCall: { value: validateFunctionToolCall },
  });
  const provider = new CustomLiteLLMProvider('fixture', {});
  provider.validateFunctionToolCall!('{}');
  await providerRegistry.withScope([provider], async () => undefined);
  expect(validateFunctionToolCall).toHaveBeenCalledWith('{}');
  expect(cleanup).toHaveBeenCalledOnce();
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

it('constructs the backward-compatible LiteLLM provider without options', () => {
  expect(new LiteLLMProvider('fixture').id()).toBe('litellm:fixture');
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
