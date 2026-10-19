import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { createUnsetOpenAiGenerationEnv } from '../../factories/literalFixtures';
import { mockProcessEnv } from '../../util/utils';

import type { OpenAiCompletionOptions } from '../../../src/providers/openai/types';
import type { CallApiContextParams } from '../../../src/types';

const context = (config: object): CallApiContextParams => ({
  vars: { effort: 'low' },
  prompt: { raw: 'Hello', label: 'Hello', config },
});

const chatProviders = [
  [
    'OpenAI',
    (
      model: string,
      config: Pick<OpenAiCompletionOptions, 'reasoning_effort' | 'reasoning' | 'passthrough'>,
    ) => new OpenAiChatCompletionProvider(model, { config, requestPolicy: 'openai' }),
  ],
  [
    'Azure',
    (
      model: string,
      config: Pick<OpenAiCompletionOptions, 'reasoning_effort' | 'reasoning' | 'passthrough'>,
    ) => new AzureChatCompletionProvider(model, { config }),
  ],
] as const;
const responsesProviders = [
  [
    'OpenAI',
    async (
      model: string,
      config: Pick<OpenAiCompletionOptions, 'reasoning_effort' | 'reasoning' | 'passthrough'>,
      promptConfig: object,
    ) =>
      (
        await new OpenAiResponsesProvider(model, { config, requestPolicy: 'openai' }).getOpenAiBody(
          'Hello',
          context(promptConfig),
        )
      ).body,
  ],
  [
    'Azure',
    async (
      model: string,
      config: Pick<OpenAiCompletionOptions, 'reasoning_effort' | 'reasoning' | 'passthrough'>,
      promptConfig: object,
    ) =>
      new AzureResponsesProvider(model, { config }).getAzureResponsesBody(
        'Hello',
        context(promptConfig),
      ),
  ],
] as const;

describe('shared reasoning request configuration', () => {
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv(createUnsetOpenAiGenerationEnv());
  });
  afterEach(() => {
    restoreEnv();
  });

  describe.each(chatProviders)('%s Chat', (_name, create) => {
    it.each(['o3', 'gpt-5', 'gpt-6-sol', 'internal-model', 'gpt-7-preview'])(
      'resolves prompt templates and clears effort for %s',
      async (model) => {
        const provider = create(model, {
          reasoning_effort: 'high',
          passthrough: { reasoning_effort: 'medium' },
        });
        const { body } = await provider.getOpenAiBody(
          'Hello',
          context({ passthrough: { reasoning_effort: '{{ effort }}' } }),
        );
        expect(body.reasoning_effort).toBe('low');
        for (const value of [null, '']) {
          const { body: cleared } = await provider.getOpenAiBody(
            'Hello',
            context({ reasoning_effort: value }),
          );
          expect(cleared).not.toHaveProperty('reasoning_effort');
        }
        expect(provider.config.reasoning_effort).toBe('high');
      },
    );

    it('evaluates only the selected effort once', async () => {
      const inherited = vi.fn(() => {
        throw new Error('overridden');
      });
      const selected = vi.fn(() => 'low');
      const { body } = await create('internal-model', {
        passthrough: { reasoning_effort: inherited },
      }).getOpenAiBody('Hello', context({ reasoning_effort: selected }));
      expect(body.reasoning_effort).toBe('low');
      expect(selected).toHaveBeenCalledTimes(1);
      expect(inherited).not.toHaveBeenCalled();
    });

    it('does not add reasoning to a GPT-4.1 request', async () => {
      const { body } = await create('gpt-4.1', { reasoning_effort: 'high' }).getOpenAiBody('Hello');
      expect(body).not.toHaveProperty('reasoning_effort');
    });
  });

  it.each([
    [{ modelName: 'grok-4' }, {}],
    [{ modelName: 'gpt-4.1' }, { modelName: 'grok-4' }],
    [{ modelName: 'gpt-4.1' }, { passthrough: { model: 'grok-4' } }],
  ])(
    'uses the effective Azure model for Grok reasoning and sampling restrictions',
    async (providerConfig, promptConfig) => {
      const { body } = await new AzureChatCompletionProvider('my-assistant', {
        config: { ...providerConfig, max_tokens: 128, reasoning_effort: 'low', stop: ['END'] },
      }).getOpenAiBody('Hello', context(promptConfig));
      expect(body).toMatchObject({ max_tokens: 128, reasoning_effort: 'low' });
      for (const field of [
        'presence_penalty',
        'frequency_penalty',
        'stop',
        'max_completion_tokens',
      ]) {
        expect(body).not.toHaveProperty(field);
      }
    },
  );

  it('does not evaluate effort for an Azure model with fixed reasoning', async () => {
    const effort = vi.fn(() => {
      throw new Error('unsupported');
    });
    const body = await new AzureResponsesProvider('gpt-chat-latest').getAzureResponsesBody(
      'Hello',
      context({ reasoning: { effort, summary: 'auto' } }),
    );
    expect(body.reasoning).toEqual({ summary: 'auto' });
    expect(effort).not.toHaveBeenCalled();
  });

  describe.each(responsesProviders)('%s Responses', (_name, getBody) => {
    it.each(['o3', 'gpt-5', 'gpt-6-sol', 'internal-model', 'gpt-7-preview'])(
      'merges and clears prompt reasoning for %s',
      async (model) => {
        const providerConfig: OpenAiCompletionOptions = {
          reasoning: { effort: 'high', summary: 'auto' },
        };
        const body = await getBody(model, providerConfig, { reasoning_effort: '{{ effort }}' });
        expect(body.reasoning).toEqual({ effort: 'low', summary: 'auto' });
        expect(body).not.toHaveProperty('reasoning_effort');
        const clearedEffort = await getBody(model, providerConfig, { reasoning_effort: null });
        expect(clearedEffort.reasoning).toEqual({ summary: 'auto' });
        const clearedOptions = await getBody(model, providerConfig, { reasoning: null });
        expect(clearedOptions).not.toHaveProperty('reasoning');
        expect(providerConfig.reasoning).toEqual({ effort: 'high', summary: 'auto' });
      },
    );

    it('does not add reasoning to a GPT-4.1 request', async () => {
      const body = await getBody('gpt-4.1', { reasoning_effort: 'high' }, {});
      expect(body).not.toHaveProperty('reasoning');
    });

    it.each([
      [{ passthrough: { reasoning: { effort: 'low', summary: 'auto' } } }, { reasoning: null }],
      [{ reasoning: null, passthrough: { reasoning: { summary: 'auto' } } }, {}],
      [{ passthrough: { reasoning: { summary: 'auto' } } }, { passthrough: { reasoning: null } }],
    ])(
      'clears inherited raw reasoning on a GPT-4.1 request: %j, %j',
      async (providerConfig, promptConfig) => {
        const body = await getBody('gpt-4.1', providerConfig, promptConfig);
        expect(body).not.toHaveProperty('reasoning');
        expect(body.temperature).toBe(0);
        expect(body.max_output_tokens).toBe(1024);
      },
    );

    it('preserves a higher-priority raw value over a provider clear on GPT-4.1', async () => {
      const body = await getBody(
        'gpt-4.1',
        { reasoning: null },
        { passthrough: { reasoning: { summary: 'auto' } } },
      );
      expect(body.reasoning).toEqual({ summary: 'auto' });
    });

    it('keeps raw reasoning and ignores unsupported typed callbacks on GPT-4.1', async () => {
      const unsupported = vi.fn(() => {
        throw new Error('unsupported reasoning callback');
      });
      const body = await getBody(
        'gpt-4.1',
        { passthrough: { reasoning: { summary: 'auto' } } },
        { reasoning: unsupported },
      );
      expect(body.reasoning).toEqual({ summary: 'auto' });
      expect(unsupported).not.toHaveBeenCalled();
    });

    it('leaves automatic temperature and token limits unset when an internal alias uses reasoning', async () => {
      const body = await getBody('internal-model', {}, { reasoning_effort: 'low' });
      expect(body.reasoning).toEqual({ effort: 'low' });
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('max_output_tokens');
    });

    it.each([
      { reasoning: null },
      { reasoning_effort: null },
      { passthrough: { reasoning: null } },
    ])(
      'does not restore automatic limits or temperature after clearing %j',
      async (promptConfig) => {
        for (const providerConfig of [{}, { reasoning: { effort: 'high' as const } }]) {
          const body = await getBody('internal-model', providerConfig, promptConfig);
          expect(body).not.toHaveProperty('reasoning');
          expect(body).not.toHaveProperty('temperature');
          expect(body).not.toHaveProperty('max_output_tokens');
        }
      },
    );

    it('preserves explicit temperature and top_p for an internal alias', async () => {
      const body = await getBody(
        'internal-model',
        {},
        { reasoning_effort: 'low', temperature: 0.4, top_p: 0.8, max_output_tokens: 2000 },
      );
      expect(body).toMatchObject({
        reasoning: { effort: 'low' },
        temperature: 0.4,
        top_p: 0.8,
        max_output_tokens: 2000,
      });
    });

    it('forwards a custom effort value for an internal alias', async () => {
      const body = await getBody('internal-model', {}, { reasoning_effort: 'internal-effort' });
      expect(body.reasoning).toEqual({ effort: 'internal-effort' });
    });

    it('preserves model-specific restrictions', async () => {
      await expect(getBody('gpt-6-astra', { reasoning_effort: 'none' }, {})).rejects.toThrow(
        'Use low instead of none',
      );
    });
  });
});
