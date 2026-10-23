import Ajv from 'ajv';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import {
  AzureChatConfigInputJsonSchema,
  AzureChatConfigInputSchema,
  OpenAiChatConfigInputJsonSchema,
  OpenAiChatConfigInputSchema,
} from '../../../src/contracts';
import { loadApiProvider } from '../../../src/providers';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { AZURE_MODELS } from '../../../src/providers/azure/defaults';
import { GroqResponsesProvider } from '../../../src/providers/groq/responses';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { createUnsetOpenAiGenerationEnv } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';

import type { AzureChatResponsesOptions } from '../../../src/providers/azure/types';
import type { OpenAiCompletionOptions } from '../../../src/providers/openai/types';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  fetchWithCache: vi.fn(),
}));
let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({
    ...createUnsetOpenAiGenerationEnv(),
    OPENAI_API_HOST: undefined,
    OPENAI_API_BASE_URL: undefined,
    OPENAI_BASE_URL: undefined,
  });
  vi.mocked(fetchWithCache).mockReset();
  vi.mocked(fetchWithCache).mockResolvedValue(
    createMockFetchResponse({
      choices: [{ message: { role: 'assistant', content: 'ready' }, finish_reason: 'stop' }],
    }),
  );
});
afterEach(() => {
  restoreEnv();
  vi.restoreAllMocks();
});

describe('explicit request policies', () => {
  it.each([undefined, 'high'] as const)(
    'preserves Groq sampling defaults with effort %s',
    async (effort) => {
      const { body } = await new GroqResponsesProvider('openai/gpt-oss-120b', {
        config: { reasoning_effort: effort },
      }).getOpenAiBody('Hello');
      expect(body.temperature).toBe(0);
      if (effort) {
        expect(body.reasoning).toEqual({ effort });
      }
    },
  );

  it.each(['openai', 'compatible'] as const)(
    'keeps unknown Responses defaults tied to the %s policy',
    async (requestPolicy) => {
      const { body } = await new OpenAiResponsesProvider('internal-model', {
        requestPolicy,
        config: { reasoning_effort: 'high' },
      }).getOpenAiBody('Hello');
      expect(body.reasoning).toEqual({ effort: 'high' });
      expect(body.temperature).toBe(requestPolicy === 'compatible' ? 0 : undefined);
      expect(body.max_output_tokens).toBe(requestPolicy === 'compatible' ? 1024 : undefined);
    },
  );

  it('uses the same stable defaults for direct, subclass, and factory consumers', async () => {
    class Adapter extends OpenAiChatCompletionProvider {}
    const factory = () => new OpenAiChatCompletionProvider('internal-model');
    for (const provider of [
      new OpenAiChatCompletionProvider('internal-model'),
      new Adapter('internal-model'),
      factory(),
    ]) {
      const { body } = await provider.getOpenAiBody('Hello');
      expect(body).toMatchObject({ max_tokens: 1024, temperature: 0 });
      expect(body).not.toHaveProperty('max_completion_tokens');
    }
  });

  it.each([
    [undefined, undefined, 'max_completion_tokens', undefined],
    ['https://gateway.example.test/v1', undefined, 'max_tokens', 0],
    ['https://gateway.example.test/v1', false, 'max_completion_tokens', undefined],
    [undefined, true, 'max_tokens', 0],
  ] as const)(
    'selects unknown-alias policy at the endpoint boundary: %s, %s',
    async (apiBaseUrl, useLegacyTokenCap, capField, temperature) => {
      const provider = await loadApiProvider('openai:chat:internal-model', {
        options: {
          config: {
            apiKey: 'fixture',
            apiBaseUrl,
            max_tokens: 73,
            useLegacyTokenCap,
          },
        },
      });
      await provider.callApi('Hello');
      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);
      expect(body[capField]).toBe(73);
      expect(body.temperature).toBe(temperature);
      expect(body).not.toHaveProperty(
        capField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens',
      );
      expect(body).not.toHaveProperty('requestPolicy');
    },
  );

  it('retains an explicit Azure environment budget for an opaque deployment', async () => {
    const reset = mockProcessEnv({ OPENAI_MAX_TOKENS: '73' });
    try {
      const { body } = await new AzureChatCompletionProvider('internal-deployment').getOpenAiBody(
        'Hello',
      );
      expect(body.max_completion_tokens).toBe(73);
      expect(body).not.toHaveProperty('max_tokens');
    } finally {
      reset();
    }
  });

  it('keeps Azure capabilities independent of pricing catalog entries', async () => {
    const provider = new AzureChatCompletionProvider('internal-deployment', {
      config: { max_tokens: 73, reasoning_effort: 'high' },
    });
    const before = (await provider.getOpenAiBody('Hello')).body;
    AZURE_MODELS.push({ ...AZURE_MODELS[0], id: 'internal-deployment' });
    try {
      const after = (await provider.getOpenAiBody('Hello')).body;
      expect(after).toEqual(before);
      expect(after).toMatchObject({ max_completion_tokens: 73, reasoning_effort: 'high' });
    } finally {
      AZURE_MODELS.pop();
    }
  });

  it.each([
    'prod-llama-3.3-70b-instruct',
    'deepseek-v3',
    'phi-4',
    'mistral-large',
    'mai-code-1',
    'cohere-command-r',
    'jais-30b-chat',
    'falcon3-7b-instruct',
    'gpt-35-turbo',
    'prod-gpt-35-turbo-0125',
    'Pixtral-Large-2411',
    'command-r-plus-08-2024',
    'command-a-03-2025',
  ])('preserves compatible Azure model defaults for %s', async (modelName) => {
    const provider = new AzureChatCompletionProvider('deployment', { config: { modelName } });
    const { body } = await provider.getOpenAiBody('Hello');
    expect(body).toMatchObject({ max_tokens: 1024, temperature: 0 });
    expect(body).not.toHaveProperty('max_completion_tokens');
    const { body: explicit } = await provider.getOpenAiBody('Hello', {
      vars: {},
      prompt: { raw: 'Hello', label: 'Hello', config: { max_tokens: 73 } },
    });
    expect(explicit).toMatchObject({ max_tokens: 73, temperature: 0 });
    expect(explicit).not.toHaveProperty('max_completion_tokens');
  });
});

describe('named token-limit clears from schema to request', () => {
  const ajv = new Ajv({ strict: false });
  it.each([
    [
      OpenAiChatConfigInputSchema,
      OpenAiChatConfigInputJsonSchema,
      (config: OpenAiCompletionOptions) => new OpenAiChatCompletionProvider('o3', { config }),
    ],
    [
      AzureChatConfigInputSchema,
      AzureChatConfigInputJsonSchema,
      (config: AzureChatResponsesOptions) => new AzureChatCompletionProvider('o3', { config }),
    ],
  ] as const)('clears either named cap after validation', async (schema, jsonSchema, create) => {
    const validate = ajv.compile(jsonSchema);
    for (const config of [{ max_tokens: null }, { max_completion_tokens: null }]) {
      expect(validate(config)).toBe(true);
      const parsed = schema.parse(config);
      const capConfig = {
        max_tokens: parsed.max_tokens,
        max_completion_tokens: parsed.max_completion_tokens,
      };
      expectTypeOf(capConfig).toExtend<
        Pick<OpenAiCompletionOptions, 'max_tokens' | 'max_completion_tokens'>
      >();
      const { body } = await create({ max_completion_tokens: 128 }).getOpenAiBody('Hello', {
        vars: {},
        prompt: { raw: 'Hello', label: 'Hello', config: capConfig },
      });
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('max_completion_tokens');
    }
  });
});
