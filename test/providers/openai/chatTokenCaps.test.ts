import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { GroqProvider } from '../../../src/providers/groq/chat';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { OpenRouterProvider } from '../../../src/providers/openrouter';
import { createUnsetOpenAiGenerationEnv } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';

describe('Chat output cap compatibility', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv(createUnsetOpenAiGenerationEnv());
  });

  afterEach(() => {
    restoreEnv();
  });

  it.each(['o1', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5.6-sol', 'internal-eval-model'])(
    'resolves explicit caps for %s by prompt, provider, then environment',
    async (model) => {
      const reset = mockProcessEnv({
        OPENAI_MAX_COMPLETION_TOKENS: '800',
        OPENAI_MAX_TOKENS: '16',
      });
      try {
        for (const [providerConfig, promptConfig, expected] of [
          [{}, {}, 800],
          [{ max_tokens: 40 }, {}, 40],
          [{ max_tokens: 40, max_completion_tokens: 50 }, {}, 50],
          [{ max_completion_tokens: 50 }, { max_tokens: 60 }, 60],
          [{ max_completion_tokens: 50 }, { passthrough: { max_tokens: 60 } }, 60],
          [{ max_tokens: 40 }, { max_tokens: 60, max_completion_tokens: 70 }, 70],
          [{ max_completion_tokens: 50, passthrough: { max_tokens: 60 } }, {}, 50],
          [{ max_completion_tokens: 50, passthrough: { max_completion_tokens: 60 } }, {}, 60],
          [{ max_tokens: 40 }, { passthrough: { max_completion_tokens: 0 } }, 0],
          [{ max_tokens: 40 }, { passthrough: { max_tokens: null } }, undefined],
          [{ max_tokens: 40 }, { passthrough: { max_completion_tokens: null } }, undefined],
        ] as const) {
          const { body } = await new OpenAiChatCompletionProvider(model, {
            config: providerConfig,
          }).getOpenAiBody('Say ready.', {
            vars: {},
            prompt: { raw: 'Say ready.', label: 'ready', config: promptConfig },
          });
          expect(body.max_completion_tokens).toBe(expected);
          expect(body).not.toHaveProperty('max_tokens');
        }
      } finally {
        reset();
      }
    },
  );

  it.each(['internal-eval-model', 'gpt-7-preview', 'openai/internal-eval-model'])(
    'uses model defaults and forwards configured effort for unknown OpenAI alias %s',
    async (model) => {
      const provider = new OpenAiChatCompletionProvider(model);
      const { body: defaults } = await provider.getOpenAiBody('Say ready.');
      for (const field of [
        'max_tokens',
        'max_completion_tokens',
        'temperature',
        'reasoning_effort',
      ]) {
        expect(defaults).not.toHaveProperty(field);
      }
      const { body } = await provider.getOpenAiBody('Say ready.', {
        vars: { effort: 'high' },
        prompt: {
          raw: 'Say ready.',
          label: 'ready',
          config: { max_tokens: 4096, reasoning_effort: '{{effort}}', temperature: 0.4 },
        },
      });
      expect(body).toMatchObject({
        max_completion_tokens: 4096,
        reasoning_effort: 'high',
        temperature: 0.4,
      });
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it('checks the final passthrough model when choosing the request surface', async () => {
    const { body } = await new OpenAiChatCompletionProvider('gpt-4o', {
      config: { max_tokens: 4096, reasoning_effort: 'high' },
    }).getOpenAiBody('Say ready.', {
      vars: {},
      prompt: {
        raw: 'Say ready.',
        label: 'ready',
        config: { passthrough: { model: 'internal-alias' } },
      },
    });
    expect(body).toMatchObject({
      model: 'internal-alias',
      max_completion_tokens: 4096,
      reasoning_effort: 'high',
    });
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
  });

  it.each(['o3', 'gpt-5', 'internal-alias'])(
    'does not apply the legacy environment budget to %s',
    async (model) => {
      const reset = mockProcessEnv({ OPENAI_MAX_TOKENS: '16' });
      try {
        const { body } = await new OpenAiChatCompletionProvider(model).getOpenAiBody('Say ready.');
        expect(body).not.toHaveProperty('max_tokens');
        expect(body).not.toHaveProperty('max_completion_tokens');
      } finally {
        reset();
      }
    },
  );

  it.each([
    'gpt-3.5-turbo',
    'gpt-4',
    'gpt-4o',
    'gpt-4.1',
    'gpt-audio-mini',
    'openai/gpt-4.1',
    'ft:gpt-4.1:org:internal-alias:id',
  ])('preserves the existing request defaults for legacy family %s', async (model) => {
    const { body } = await new OpenAiChatCompletionProvider(model, {
      config: { reasoning_effort: 'high' },
    }).getOpenAiBody('Say ready.');
    expect(body).toMatchObject({ max_tokens: 1024, temperature: 0 });
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('reasoning_effort');
  });

  it('does not infer legacy capabilities from a fine-tune experiment name', async () => {
    const { body } = await new OpenAiChatCompletionProvider('ft:internal-alias:org:gpt-4.1:id', {
      config: { max_tokens: 4096 },
    }).getOpenAiBody('Say ready.');
    expect(body.max_completion_tokens).toBe(4096);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('preserves OpenRouter passthrough precedence for known reasoning models', async () => {
    const { body } = await new OpenRouterProvider('openai/o3', {
      config: { max_tokens: 40, max_completion_tokens: 50, passthrough: { max_tokens: 60 } },
    }).getOpenAiBody('Say ready.');
    expect(body.max_completion_tokens).toBe(60);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('preserves dedicated compatible adapters for non-OpenAI models', async () => {
    const { body } = await new GroqProvider('llama-3.3-70b-versatile', {
      config: { max_tokens: 128 },
    }).getOpenAiBody('Say ready.');
    expect(body.max_tokens).toBe(128);
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('keeps Responses on max_output_tokens', async () => {
    const { body } = await new OpenAiResponsesProvider('gpt-5', {
      config: { max_output_tokens: 4096 },
    }).getOpenAiBody('Say ready.');
    expect(body.max_output_tokens).toBe(4096);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it('allows an unknown OpenAI-compatible alias to opt into legacy caps', async () => {
    const { body } = await new OpenAiChatCompletionProvider('older-private-model', {
      config: { useLegacyTokenCap: true, max_tokens: 128, reasoning_effort: 'high' },
    }).getOpenAiBody('Say ready.');
    expect(body).toMatchObject({ max_tokens: 128, temperature: 0 });
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('useLegacyTokenCap');
  });

  it.each(['0', '0.7'])(
    'preserves explicit sampling environment values for unknown aliases: %s',
    async (value) => {
      const reset = mockProcessEnv({
        OPENAI_TEMPERATURE: value,
        OPENAI_TOP_P: value,
        OPENAI_PRESENCE_PENALTY: value,
        OPENAI_FREQUENCY_PENALTY: value,
      });
      try {
        for (const provider of [
          new OpenAiChatCompletionProvider('internal-alias'),
          new AzureChatCompletionProvider('internal-deployment'),
        ]) {
          const { body } = await provider.getOpenAiBody('Say ready.');
          expect(body).toMatchObject({
            temperature: Number(value),
            top_p: Number(value),
            presence_penalty: Number(value),
            frequency_penalty: Number(value),
          });
          expect(body).not.toHaveProperty('max_tokens');
          expect(body).not.toHaveProperty('max_completion_tokens');
        }
      } finally {
        reset();
      }
    },
  );

  it('preserves the legacy request defaults for the ChatGPT GPT-4o alias', async () => {
    const { body } = await new OpenAiChatCompletionProvider('chatgpt-4o-latest', {
      config: { apiBaseUrl: 'https://proxy.example.test/v1', max_tokens: 128 },
    }).getOpenAiBody('Say ready.');
    expect(body).toMatchObject({ max_tokens: 128, temperature: 0 });
    expect(body).not.toHaveProperty('max_completion_tokens');
  });

  it.each([
    ['https://proxy.example.test/v1', 'https://openrouter.ai/api/v1', 60],
    ['https://openrouter.ai/api/v1', 'https://proxy.example.test/v1', 50],
  ] as const)(
    'uses the effective prompt endpoint for cap precedence: %s to %s',
    async (providerUrl, promptUrl, expected) => {
      const { body } = await new OpenAiChatCompletionProvider('o3', {
        config: {
          apiBaseUrl: providerUrl,
          max_completion_tokens: 50,
          passthrough: { max_tokens: 60 },
        },
      }).getOpenAiBody('Say ready.', {
        vars: {},
        prompt: { raw: 'Say ready.', label: 'ready', config: { apiBaseUrl: promptUrl } },
      });
      expect(body.max_completion_tokens).toBe(expected);
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it.each(['o3-mini', 'internal-deployment'])(
    'normalizes Azure explicit caps for %s',
    async (deployment) => {
      const { body } = await new AzureChatCompletionProvider(deployment, {
        config: { max_completion_tokens: 4096 },
      }).getOpenAiBody('Say ready.', {
        vars: {},
        prompt: { raw: 'Say ready.', label: 'ready', config: { max_tokens: 128 } },
      });
      expect(body.max_completion_tokens).toBe(128);
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it('uses model defaults for unknown Azure aliases and allows a legacy opt-out', async () => {
    const { body } = await new AzureChatCompletionProvider('internal-deployment', {
      config: { reasoning_effort: 'high' },
    }).getOpenAiBody('Say ready.');
    expect(body.reasoning_effort).toBe('high');
    for (const field of [
      'max_tokens',
      'max_completion_tokens',
      'temperature',
      'top_p',
      'presence_penalty',
      'frequency_penalty',
    ]) {
      expect(body).not.toHaveProperty(field);
    }
    const { body: legacy } = await new AzureChatCompletionProvider('internal-deployment', {
      config: { isReasoningModel: false },
    }).getOpenAiBody('Say ready.');
    expect(legacy).toMatchObject({ max_tokens: 1024, temperature: 0 });
  });

  it.each(['gpt-4o', 'prod-gpt-4.1', 'claude-opus-4-7', 'grok-4'])(
    'preserves Azure known model %s',
    async (deployment) => {
      const { body } = await new AzureChatCompletionProvider(deployment, {
        config: { max_tokens: 128 },
      }).getOpenAiBody('Say ready.');
      expect(body.max_tokens).toBe(128);
      expect(body).not.toHaveProperty('max_completion_tokens');
    },
  );
});
