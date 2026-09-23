import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';
import { calculateAzureCost } from '../../../src/providers/azure/util';
import {
  BedrockOpenAiResponsesProvider,
  createBedrockOpenAiResponsesProvider,
} from '../../../src/providers/bedrock/openaiResponses';
import { CloudflareGatewayOpenAiProvider } from '../../../src/providers/cloudflare-gateway';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { getGpt6Variant } from '../../../src/providers/openai/gpt6';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { OpenRouterProvider } from '../../../src/providers/openrouter';
import { TrueFoundryProvider } from '../../../src/providers/truefoundry';
import { mockProcessEnv } from '../../util/utils';

const statusTool = {
  type: 'function' as const,
  function: {
    name: 'get_status',
    description: 'Return the current job status.',
    parameters: { type: 'object' as const, properties: {} },
  },
};

describe('GPT-6 Astra requests', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      OPENAI_MAX_TOKENS: undefined,
      OPENAI_MAX_COMPLETION_TOKENS: undefined,
      OPENAI_TEMPERATURE: undefined,
      OPENAI_TOP_P: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('renders a dynamic GPT-6 Astra Responses reasoning object once', async () => {
    const reasoning = vi.fn(({ vars }: { vars: { effort: string } }) => ({
      effort: vars.effort,
      summary: 'auto',
    }));
    const { body } = await new OpenAiResponsesProvider('gpt-6-astra', {
      config: { reasoning: reasoning as any },
    }).getOpenAiBody('Say ready.', {
      vars: { effort: 'low' },
      prompt: { raw: 'Say ready.', label: 'ready' },
    });
    expect(body.reasoning).toEqual({ effort: 'low', summary: 'auto' });
    expect(reasoning).toHaveBeenCalledTimes(1);
  });

  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'preserves %s reasoning and verbosity on both OpenAI endpoints',
    async (effort) => {
      const config = { reasoning_effort: effort, verbosity: 'low' as const };
      const { body: chat } = await new OpenAiChatCompletionProvider('gpt-6-astra', {
        config,
      }).getOpenAiBody('Summarize the job.');
      const { body: responses } = await new OpenAiResponsesProvider('gpt-6-astra', {
        config,
      }).getOpenAiBody('Summarize the job.');

      expect(chat).toMatchObject({ reasoning_effort: effort, verbosity: 'low' });
      expect(responses).toMatchObject({ reasoning: { effort }, text: { verbosity: 'low' } });
      for (const body of [chat, responses]) {
        expect(body).not.toHaveProperty('temperature');
        expect(body).not.toHaveProperty('max_tokens');
        expect(body).not.toHaveProperty('max_completion_tokens');
        expect(body).not.toHaveProperty('max_output_tokens');
      }
    },
  );

  it.each([
    { api: 'Chat', Provider: OpenAiChatCompletionProvider },
    { api: 'Responses', Provider: OpenAiResponsesProvider },
  ])(
    'removes unsupported parameters after a per-prompt model override in $api',
    async ({ Provider }) => {
      const passthrough = {
        model: 'gpt-6-astra',
        temperature: 0.4,
        top_p: 0.8,
        logprobs: true,
        top_logprobs: 5,
        max_tokens: 100,
        max_completion_tokens: 321,
        max_output_tokens: 654,
      };
      const { body } = await new Provider('gpt-4.1').getOpenAiBody(
        'Summarize the job.',
        {
          prompt: {
            raw: 'Summarize the job.',
            label: 'summary',
            config: { passthrough, reasoning_effort: 'max', verbosity: 'low' },
          },
          vars: {},
        },
        { includeLogProbs: true },
      );

      expect(body.model).toBe('gpt-6-astra');
      for (const key of ['temperature', 'top_p', 'logprobs', 'top_logprobs', 'max_tokens']) {
        expect(body).not.toHaveProperty(key);
      }
      if (Provider === OpenAiChatCompletionProvider) {
        expect(body.max_completion_tokens).toBe(321);
        expect(body).not.toHaveProperty('max_output_tokens');
      } else {
        expect(body.max_output_tokens).toBe(654);
        expect(body).not.toHaveProperty('max_completion_tokens');
      }
      expect(passthrough.temperature).toBe(0.4);
    },
  );

  it.each([
    { api: 'OpenAI Chat', Provider: OpenAiChatCompletionProvider },
    { api: 'OpenAI Responses', Provider: OpenAiResponsesProvider },
    { api: 'Azure Chat', Provider: AzureChatCompletionProvider },
    { api: 'Azure Responses', Provider: AzureResponsesProvider },
  ])('uses GPT-4.1 capabilities when overriding Astra in $api', async ({ Provider }) => {
    const provider = new Provider('gpt-6-astra', {
      config: {
        apiKey: 'test-key',
        modelName: 'gpt-6-astra',
        reasoning_effort: 'max',
        reasoning: { effort: 'max', summary: 'auto' },
        verbosity: 'low',
        temperature: 0.4,
        top_p: 0.8,
      },
    });
    const context = {
      vars: {},
      prompt: {
        raw: 'Summarize the job.',
        label: 'summary',
        config: { passthrough: { model: 'gpt-4.1' } },
      },
    };
    const body =
      provider instanceof AzureResponsesProvider
        ? await provider.getAzureResponsesBody('Summarize the job.', context)
        : (await provider.getOpenAiBody('Summarize the job.', context)).body;

    expect(body).toMatchObject({ model: 'gpt-4.1', temperature: 0.4, top_p: 0.8 });
    expect(body).not.toHaveProperty('reasoning');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('verbosity');
    expect(body).not.toHaveProperty('text.verbosity');
    expect(provider.config.reasoning_effort).toBe('max');
  });

  it('preserves Responses tools, cache options, output limits, and supported includes', async () => {
    const include = ['message.output_text.logprobs', 'reasoning.encrypted_content'] as const;
    const { body } = await new OpenAiResponsesProvider('gpt-6-astra', {
      config: {
        reasoning: { effort: 'max', summary: 'auto' },
        max_output_tokens: 4096,
        tools: [statusTool],
        tool_choice: 'required',
        prompt_cache_options: { mode: 'explicit', ttl: '30m' },
        passthrough: { include },
      },
    }).getOpenAiBody('Get the job status.');

    expect(body).toMatchObject({
      reasoning: { effort: 'max', summary: 'auto' },
      max_output_tokens: 4096,
      tools: [{ type: 'function', name: 'get_status' }],
      tool_choice: 'required',
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
      include: ['reasoning.encrypted_content'],
    });
    expect(include).toHaveLength(2);
  });

  it.each([
    { api: 'Chat', Provider: OpenAiChatCompletionProvider },
    { api: 'Responses', Provider: OpenAiResponsesProvider },
  ])('passes the effective $api service tier to billing', async ({ Provider }) => {
    const provider = new Provider('gpt-6-astra', {
      config: { service_tier: null, passthrough: { service_tier: 'flex' } },
    });
    const { body, config } = await provider.getOpenAiBody('Summarize the job.');

    expect(body.service_tier).toBe('flex');
    expect(config.service_tier).toBe('flex');
    expect(provider.config.service_tier).toBeNull();
  });

  it.each(['none', 'minimal', 'ultra'])(
    'rejects unsupported %s reasoning from the final request',
    async (effort) => {
      await expect(
        new OpenAiChatCompletionProvider('gpt-6-astra', {
          config: { passthrough: { reasoning_effort: effort } },
        }).getOpenAiBody('Summarize the job.'),
      ).rejects.toThrow('GPT-6 Astra supports reasoning effort');
      await expect(
        new OpenAiResponsesProvider('gpt-6-astra', {
          config: { passthrough: { reasoning: { effort } } },
        }).getOpenAiBody('Summarize the job.'),
      ).rejects.toThrow('GPT-6 Astra supports reasoning effort');
    },
  );

  it.each([
    { tools: [statusTool] },
    { functions: [statusTool.function] },
    { tool_choice: 'auto' },
    { function_call: 'auto' },
  ])('directs Chat tool requests to Responses', async (passthrough) => {
    await expect(
      new OpenAiChatCompletionProvider('gpt-6-astra', {
        config: { passthrough },
      }).getOpenAiBody('Get the job status.'),
    ).rejects.toThrow('tool calling requires the Responses API');
  });

  it.each(['', null])('omits unset reasoning effort %s without mutating config', async (effort) => {
    const reasoning = { effort, summary: 'auto' };
    const { body: chat } = await new OpenAiChatCompletionProvider('gpt-6-astra', {
      config: { passthrough: { reasoning_effort: effort } },
    }).getOpenAiBody('Summarize the job.');
    const { body: responses } = await new OpenAiResponsesProvider('gpt-6-astra', {
      config: { passthrough: { reasoning } },
    }).getOpenAiBody('Summarize the job.');

    expect(chat).not.toHaveProperty('reasoning_effort');
    expect(responses.reasoning).toEqual({ summary: 'auto' });
    expect(reasoning.effort).toBe(effort);
  });

  it('omits an empty reasoning object after rendering an unset effort', async () => {
    const context = {
      vars: { effort: '' },
      prompt: {
        raw: 'Summarize the job.',
        label: 'summary',
        config: { reasoning: { effort: '{{effort}}' } },
      },
    };
    const { body } = await new OpenAiResponsesProvider('gpt-6-astra').getOpenAiBody(
      'Summarize the job.',
      context,
    );

    expect(body).not.toHaveProperty('reasoning');
    expect(context.prompt.config.reasoning.effort).toBe('{{effort}}');
  });

  it('rejects Astra conversation updates to none and strips sampling with unknown stored effort', async () => {
    const provider = new OpenAiResponsesProvider('gpt-6-astra', {
      config: {
        previous_response_id: 'resp_previous',
        reasoning: { effort: 'high' },
        temperature: 0.3,
        top_p: 0.8,
      },
    });
    await expect(
      provider.getOpenAiBody(
        JSON.stringify([
          { type: 'configuration_update', reasoning: { effort: 'none' } },
          { role: 'user', content: 'Say ready.' },
        ]),
      ),
    ).rejects.toThrow('GPT-6 Astra supports reasoning effort');

    const { body } = await provider.getOpenAiBody('Say ready.');
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
  });

  it.each(['max', 'none'])(
    'rejects a Chat-shaped passthrough reasoning_effort of %s on Responses',
    async (effort) => {
      await expect(
        new OpenAiResponsesProvider('gpt-6-astra', {
          config: { passthrough: { reasoning_effort: effort } },
        }).getOpenAiBody('Summarize the job.'),
      ).rejects.toThrow('instead of passthrough.reasoning_effort');
    },
  );

  it('preserves gateway tool routing for prefixed Astra model IDs', async () => {
    const { body } = await new OpenRouterProvider('openai/gpt-6-astra', {
      config: {
        reasoning_effort: 'max',
        tools: [statusTool],
        top_p: 0.8,
        max_completion_tokens: 4096,
      },
    }).getOpenAiBody('Get the job status.');

    expect(body).toMatchObject({
      model: 'openai/gpt-6-astra',
      reasoning_effort: 'max',
      tools: [statusTool],
      max_completion_tokens: 4096,
    });
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body).not.toHaveProperty('max_tokens');
  });

  it.each([
    { deployment: 'gpt-6-astra' },
    { deployment: 'prod-gpt-6-astra' },
    { deployment: 'production', modelName: 'gpt-6-astra' },
  ])(
    'prepares Azure deployment $deployment without assuming Azure pricing',
    async ({ deployment, modelName }) => {
      const config = {
        apiKey: 'test-key',
        modelName,
        reasoning_effort: 'max' as const,
        max_completion_tokens: 4096,
        max_output_tokens: 4096,
        top_p: 0.8,
        verbosity: 'low' as const,
      };
      const { body: chat } = await new AzureChatCompletionProvider(deployment, {
        config,
      }).getOpenAiBody('Summarize the job.');
      const responses = await new AzureResponsesProvider(deployment, {
        config,
      }).getAzureResponsesBody('Summarize the job.');

      expect(chat).toMatchObject({
        model: deployment,
        reasoning_effort: 'max',
        max_completion_tokens: 4096,
      });
      expect(responses).toMatchObject({
        model: deployment,
        reasoning: { effort: 'max' },
        max_output_tokens: 4096,
      });
      for (const body of [chat, responses]) {
        expect(body).not.toHaveProperty('temperature');
        expect(body).not.toHaveProperty('top_p');
        expect(body).not.toHaveProperty('max_tokens');
      }
      expect(calculateAzureCost('gpt-6-astra', config, 1000, 100)).toBeUndefined();
    },
  );

  it('requires Responses for Azure tools routed through Cloudflare', async () => {
    const provider = new CloudflareGatewayOpenAiProvider('azure-openai', 'gpt-6-astra', {
      config: {
        accountId: 'test-account',
        gatewayId: 'test-gateway',
        resourceName: 'test-resource',
        deploymentName: 'gpt-6-astra',
        apiKey: 'test-key',
        tools: [statusTool],
      },
    });

    await expect(provider.getOpenAiBody('Get the job status.')).rejects.toThrow(
      'tool calling requires the Responses API',
    );
  });

  it('rejects unsupported Astra requests on custom Azure deployments', async () => {
    await expect(
      new AzureChatCompletionProvider('production', {
        config: { apiKey: 'test-key', modelName: 'gpt-6-astra', tools: [statusTool] },
      }).getOpenAiBody('Get the job status.'),
    ).rejects.toThrow('tool calling requires the Responses API');
    await expect(
      new AzureResponsesProvider('production', {
        config: { apiKey: 'test-key', modelName: 'gpt-6-astra', reasoning_effort: 'none' },
      }).getAzureResponsesBody('Summarize the job.'),
    ).rejects.toThrow('GPT-6 Astra supports reasoning effort');
  });

  it('recognizes per-prompt Astra model overrides on both Azure endpoints', async () => {
    const config = { apiKey: 'test-key', modelName: 'gpt-4.1' };
    const context = {
      vars: {},
      prompt: {
        raw: 'Summarize the job.',
        label: 'summary',
        config: {
          reasoning_effort: 'max',
          passthrough: {
            model: 'gpt-6-astra',
            temperature: 0.4,
            top_p: 0.8,
            logprobs: true,
            top_logprobs: 5,
            max_tokens: 100,
          },
        },
      },
    };
    const { body: chat, config: chatConfig } = await new AzureChatCompletionProvider('production', {
      config,
    }).getOpenAiBody('Summarize the job.', context);
    const responses = await new AzureResponsesProvider('production', {
      config,
    }).getAzureResponsesBody('Summarize the job.', context);

    expect(chat.reasoning_effort).toBe('max');
    expect(chatConfig.modelName).toBe('gpt-6-astra');
    expect(calculateAzureCost(chatConfig.modelName, chatConfig, 2000, 1000)).toBeUndefined();
    expect(responses.reasoning).toEqual({ effort: 'max' });
    for (const body of [chat, responses]) {
      expect(body.model).toBe('gpt-6-astra');
      for (const key of ['temperature', 'top_p', 'logprobs', 'top_logprobs', 'max_tokens']) {
        expect(body).not.toHaveProperty(key);
      }
    }

    context.prompt.config.reasoning_effort = 'none';
    await expect(
      new AzureChatCompletionProvider('production', { config }).getOpenAiBody('Test', context),
    ).rejects.toThrow('GPT-6 Astra supports reasoning effort');
    await expect(
      new AzureResponsesProvider('production', { config }).getAzureResponsesBody('Test', context),
    ).rejects.toThrow('GPT-6 Astra supports reasoning effort');
  });

  it.each(['gpt-6-astra', 'gpt-5.6-sol'])(
    'normalizes Azure Responses function tools and tool choice for %s',
    async (model) => {
      const body = await new AzureResponsesProvider(model, {
        config: {
          apiKey: 'test-key',
          tools: [statusTool],
          tool_choice: { type: 'function', function: { name: 'get_status' } },
        },
      }).getAzureResponsesBody('Get the job status.');

      expect(body.tools).toEqual([{ type: 'function', ...statusTool.function }]);
      expect(body.tool_choice).toEqual({ type: 'function', name: 'get_status' });
      expect(statusTool).toHaveProperty('function');
    },
  );
});

describe.each(['gpt-6-sol', 'gpt-6-luna'])('%s requests', (model) => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      OPENAI_MAX_TOKENS: undefined,
      OPENAI_MAX_COMPLETION_TOKENS: undefined,
      OPENAI_TEMPERATURE: undefined,
      OPENAI_TOP_P: undefined,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('uses a fine-tune base model without treating its user-supplied suffix as a model', async () => {
    const unrelated = `ft:gpt-4.1-mini-2025-04-14:org:compare-${model}:id`;
    expect(getGpt6Variant(unrelated)).toBeUndefined();
    expect(getGpt6Variant(`openai/${unrelated}`)).toBeUndefined();
    expect(getGpt6Variant(`ft:${model}:org:compare-gpt-4.1-mini:id`)).toBe(model.slice(6));
    expect(getGpt6Variant(`openai/ft:${model}:org:experiment:id`)).toBe(model.slice(6));
    expect(getGpt6Variant(`prod-${model}`)).toBe(model.slice(6));

    const { body: chat } = await new OpenAiChatCompletionProvider(unrelated, {
      config: { temperature: 0.4, top_p: 0.8, tools: [statusTool], verbosity: 'low' },
    }).getOpenAiBody('Get the job status.');
    const { body: responses } = await new OpenAiResponsesProvider(unrelated, {
      config: { temperature: 0.4, top_p: 0.8, tools: [statusTool], verbosity: 'low' },
    }).getOpenAiBody('Get the job status.');
    expect(chat).toMatchObject({
      model: unrelated,
      temperature: 0.4,
      top_p: 0.8,
      tools: [statusTool],
    });
    expect(chat).not.toHaveProperty('verbosity');
    expect(responses).toMatchObject({
      model: unrelated,
      temperature: 0.4,
      top_p: 0.8,
      tools: [{ type: 'function', name: 'get_status' }],
    });
    expect(responses).not.toHaveProperty('verbosity');
  });

  it.each(['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'sends %s reasoning on both endpoints and keeps sampling only for none',
    async (effort) => {
      const config = {
        reasoning_effort: effort,
        temperature: 0.3,
        top_p: 0.8,
        verbosity: 'low' as const,
      };
      const { body: chat } = await new OpenAiChatCompletionProvider(model, {
        config: {
          ...config,
          max_completion_tokens: 200,
          passthrough: { top_logprobs: 2, max_output_tokens: 999, max_tokens: 999 },
        },
      }).getOpenAiBody('Say ready.', undefined, { includeLogProbs: true });
      const { body: responses } = await new OpenAiResponsesProvider(model, {
        config: {
          ...config,
          max_output_tokens: 300,
          include: ['message.output_text.logprobs', 'reasoning.encrypted_content'],
          passthrough: { top_logprobs: 2, max_completion_tokens: 999, max_tokens: 999 },
        },
      }).getOpenAiBody('Say ready.');

      expect(chat).toMatchObject({
        reasoning_effort: effort,
        verbosity: 'low',
        max_completion_tokens: 200,
      });
      expect(responses).toMatchObject({
        reasoning: { effort },
        text: { verbosity: 'low' },
        max_output_tokens: 300,
      });
      expect(chat).not.toHaveProperty('max_output_tokens');
      expect(responses).not.toHaveProperty('max_completion_tokens');
      for (const body of [chat, responses]) {
        expect(body).not.toHaveProperty('max_tokens');
        if (effort === 'none') {
          expect(body).toMatchObject({ temperature: 0.3, top_p: 0.8, top_logprobs: 2 });
        } else {
          for (const key of ['temperature', 'top_p', 'logprobs', 'top_logprobs']) {
            expect(body).not.toHaveProperty(key);
          }
        }
      }
      if (effort === 'none') {
        expect(chat.logprobs).toBe(true);
      }
      expect(responses.include).toEqual(
        effort === 'none'
          ? ['message.output_text.logprobs', 'reasoning.encrypted_content']
          : ['reasoning.encrypted_content'],
      );
    },
  );

  it('leaves default reasoning and output limits to the API and removes sampling', async () => {
    const config = { temperature: 0.5, top_p: 0.8 };
    const { body: chat } = await new OpenAiChatCompletionProvider(model, { config }).getOpenAiBody(
      'Say ready.',
    );
    const { body: responses } = await new OpenAiResponsesProvider(model, { config }).getOpenAiBody(
      'Say ready.',
    );

    for (const body of [chat, responses]) {
      for (const field of [
        'reasoning_effort',
        'reasoning',
        'temperature',
        'top_p',
        'max_tokens',
        'max_completion_tokens',
        'max_output_tokens',
      ]) {
        expect(body).not.toHaveProperty(field);
      }
    }
  });

  it('preserves native and gateway Chat output budgets across provider and prompt aliases', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    for (const provider of [
      new OpenAiChatCompletionProvider(model, { config: { max_tokens: 41 } }),
      new OpenAiChatCompletionProvider(model, {
        config: { apiBaseUrl: 'https://proxy.example.test/v1', max_tokens: 41 },
      }),
      new TrueFoundryProvider(`openai-main/${model}`, { config: { max_tokens: 41 } }),
    ]) {
      const { body } = await provider.getOpenAiBody('Say ready.');
      expect(body.max_completion_tokens).toBe(41);
      expect(body).not.toHaveProperty('max_tokens');
      const { body: promptCap } = await provider.getOpenAiBody('Say ready.', {
        vars: {},
        prompt: { ...prompt, config: { passthrough: { max_completion_tokens: 23 } } },
      });
      expect(promptCap.max_completion_tokens).toBe(23);
      const { body: cleared } = await provider.getOpenAiBody('Say ready.', {
        vars: {},
        prompt: { ...prompt, config: { passthrough: { max_tokens: null } } },
      });
      expect(cleared).not.toHaveProperty('max_completion_tokens');
    }

    const { body: canonical } = await new OpenAiChatCompletionProvider(model, {
      config: { max_completion_tokens: 55, passthrough: { max_tokens: 99 } },
    }).getOpenAiBody('Say ready.');
    expect(canonical.max_completion_tokens).toBe(55);

    const restoreCaps = mockProcessEnv({ OPENAI_MAX_TOKENS: '71' });
    try {
      const { body: fromEnvironment } = await new OpenAiChatCompletionProvider(model).getOpenAiBody(
        'Say ready.',
      );
      expect(fromEnvironment.max_completion_tokens).toBe(71);
    } finally {
      restoreCaps();
    }
  });

  it.each(['none', 'high'] as const)(
    'rejects native Chat config.reasoning at %s',
    async (effort) => {
      const prompt = { raw: 'Say ready.', label: 'ready' };
      for (const request of [
        new OpenAiChatCompletionProvider(model, {
          config: { reasoning: { effort }, temperature: 0.8 },
        }).getOpenAiBody('Say ready.'),
        new OpenAiChatCompletionProvider(model).getOpenAiBody('Say ready.', {
          vars: {},
          prompt: { ...prompt, config: { reasoning: { effort } } },
        }),
      ]) {
        await expect(request).rejects.toThrow('Configure reasoning_effort');
      }
    },
  );

  it('only applies the default Responses temperature when the current effort is known to be none', async () => {
    const responseFor = (config: ConstructorParameters<typeof OpenAiResponsesProvider>[1] = {}) =>
      new OpenAiResponsesProvider(model, config).getOpenAiBody('Say ready.');

    for (const config of [
      { reasoning: { effort: 'none' as const } },
      { reasoning_effort: 'none' as const },
      { passthrough: { reasoning: { effort: 'none' } } },
    ]) {
      expect((await responseFor({ config })).body.temperature).toBe(0);
    }
    for (const config of [
      { reasoning: { effort: 'none' as const }, omitDefaults: true },
      { reasoning: { effort: 'high' as const } },
      {},
    ]) {
      expect((await responseFor({ config })).body).not.toHaveProperty('temperature');
    }
    const passthrough = { temperature: undefined };
    const { body: explicitlyOmitted } = await responseFor({
      config: { reasoning: { effort: 'none' }, passthrough },
    });
    expect(explicitlyOmitted.temperature).toBeUndefined();

    const restoreTemperature = mockProcessEnv({ OPENAI_TEMPERATURE: '0.45' });
    try {
      const { body: fromEnv } = await responseFor({
        config: { reasoning: { effort: 'none' }, omitDefaults: true },
      });
      expect(fromEnv.temperature).toBe(0.45);
      const { body: fromConfig } = await responseFor({
        config: { reasoning: { effort: 'none' }, temperature: 0.2 },
      });
      expect(fromConfig.temperature).toBe(0.2);
    } finally {
      restoreTemperature();
    }

    const updatedInput = JSON.stringify([
      { type: 'configuration_update', reasoning: { effort: 'none' } },
      { role: 'user', content: 'Say ready.' },
    ]);
    const { body: updated } = await new OpenAiResponsesProvider(model, {
      config: { previous_response_id: 'resp_previous', reasoning: { effort: 'high' } },
    }).getOpenAiBody(updatedInput);
    expect(updated.temperature).toBe(0);

    const azure = await new AzureResponsesProvider(`prod-${model}`, {
      config: { apiKey: 'test-key', reasoning_effort: 'none' },
    }).getAzureResponsesBody('Say ready.');
    const azureOmitted = await new AzureResponsesProvider(`prod-${model}`, {
      config: { apiKey: 'test-key', reasoning_effort: 'none', omitDefaults: true },
    }).getAzureResponsesBody('Say ready.');
    const azureStored = await new AzureResponsesProvider(`prod-${model}`, {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'none',
        previous_response_id: 'resp_previous',
      },
    }).getAzureResponsesBody('Say ready.');
    expect(azure.temperature).toBe(0);
    expect(azureOmitted).not.toHaveProperty('temperature');
    expect(azureStored).not.toHaveProperty('temperature');
  });

  it.each([
    { topLevel: 'high', updates: ['none'], keepsSampling: true },
    { topLevel: 'none', updates: ['high'], keepsSampling: false },
    { topLevel: 'high', updates: ['none', 'high', 'none'], keepsSampling: true },
    { topLevel: 'none', updates: ['high', 'none', 'low'], keepsSampling: false },
  ] as const)(
    'uses the last Responses configuration update for sampling ($topLevel, $updates)',
    async ({ topLevel, updates, keepsSampling }) => {
      const input = updates.flatMap((effort) => [
        { type: 'configuration_update', reasoning: { effort } },
        { role: 'user', content: 'Say ready.' },
      ]);
      const { body } = await new OpenAiResponsesProvider(model, {
        config: {
          reasoning: { effort: topLevel },
          temperature: 0.3,
          top_p: 0.8,
          include: ['message.output_text.logprobs', 'reasoning.encrypted_content'],
          passthrough: { top_logprobs: 2 },
        },
      }).getOpenAiBody(JSON.stringify(input));

      expect(body.input).toEqual(input);
      expect(body.reasoning).toEqual({ effort: topLevel });
      if (keepsSampling) {
        expect(body).toMatchObject({ temperature: 0.3, top_p: 0.8, top_logprobs: 2 });
        expect(body.include).toEqual([
          'message.output_text.logprobs',
          'reasoning.encrypted_content',
        ]);
      } else {
        for (const key of ['temperature', 'top_p', 'top_logprobs']) {
          expect(body).not.toHaveProperty(key);
        }
        expect(body.include).toEqual(['reasoning.encrypted_content']);
      }
    },
  );

  it('treats referenced Responses items as opaque until a later reasoning update', async () => {
    const user = { role: 'user', content: 'Say ready.' };
    const update = (effort: string) => ({ type: 'configuration_update', reasoning: { effort } });
    for (const reference of [
      { type: 'item_reference', id: 'item_opaque' },
      { id: 'item_opaque' },
      { id: 'item_opaque', type: null },
    ]) {
      const provider = new OpenAiResponsesProvider(model, {
        config: { reasoning: { effort: 'high' }, temperature: 0.3, top_p: 0.8 },
      });
      for (const input of [
        [reference, user],
        [update('none'), user, reference, user],
      ]) {
        const { body } = await provider.getOpenAiBody(JSON.stringify(input));
        expect(body).toMatchObject({ temperature: 0.3, top_p: 0.8 });
      }
      const { body: high } = await provider.getOpenAiBody(
        JSON.stringify([reference, user, update('high'), user]),
      );
      expect(high).not.toHaveProperty('temperature');
      expect(high).not.toHaveProperty('top_p');
      const { body: none } = await provider.getOpenAiBody(
        JSON.stringify([reference, user, update('none'), user]),
      );
      expect(none).toMatchObject({ temperature: 0.3, top_p: 0.8 });

      const { body: noDefault } = await new OpenAiResponsesProvider(model, {
        config: { reasoning: { effort: 'none' } },
      }).getOpenAiBody(JSON.stringify([reference, user]));
      expect(noDefault).not.toHaveProperty('temperature');
    }
  });

  it('discards reasoning updates before a returned Responses compaction item', async () => {
    const user = { role: 'user', content: 'Say ready.' };
    const update = (effort: string) => ({ type: 'configuration_update', reasoning: { effort } });
    const compaction = { type: 'compaction', id: 'item_compacted', encrypted_content: 'opaque' };
    for (const [baseline, earlier] of [
      ['high', 'none'],
      ['none', 'high'],
    ] as const) {
      const provider = new OpenAiResponsesProvider(model, {
        config: { reasoning: { effort: baseline }, temperature: 0.3, top_p: 0.8 },
      });
      const { body } = await provider.getOpenAiBody(
        JSON.stringify([update(earlier), user, compaction, user]),
      );
      expect(body.temperature).toBe(baseline === 'none' ? 0.3 : undefined);
      expect(body.top_p).toBe(baseline === 'none' ? 0.8 : undefined);

      const { body: fresh } = await provider.getOpenAiBody(
        JSON.stringify([update(earlier), user, compaction, update(earlier), user]),
      );
      expect(fresh.temperature).toBe(earlier === 'none' ? 0.3 : undefined);
      expect(fresh.top_p).toBe(earlier === 'none' ? 0.8 : undefined);
    }
  });

  it('uses a final passthrough input and validates both request and conversation efforts', async () => {
    const promptInput = JSON.stringify([
      { type: 'configuration_update', reasoning: { effort: 'high' } },
      { role: 'user', content: 'Say ready.' },
    ]);
    const input = [
      { type: 'configuration_update', reasoning: { effort: 'none' } },
      { role: 'user', content: 'Say ready.' },
    ];
    const { body } = await new OpenAiResponsesProvider(model, {
      config: { reasoning: { effort: 'high' }, temperature: 0.4, passthrough: { input } },
    }).getOpenAiBody(promptInput);
    expect(body.input).toBe(input);
    expect(body.temperature).toBe(0.4);

    for (const config of [
      { passthrough: { reasoning: { effort: 'ultra' }, input } },
      {
        reasoning: { effort: 'none' as const },
        passthrough: {
          input: [
            { type: 'configuration_update', reasoning: { effort: 'ultra' } },
            { role: 'user', content: 'Say ready.' },
            ...input,
          ],
        },
      },
    ]) {
      await expect(
        new OpenAiResponsesProvider(model, { config }).getOpenAiBody('Say ready.'),
      ).rejects.toThrow('supports reasoning effort none, low, medium, high, xhigh, or max');
    }
  });

  it.each([
    { previous_response_id: 'resp_previous' },
    { passthrough: { conversation: 'conv_previous' } },
  ])('leaves explicit sampling to the API when the stored effort is unknown', async (history) => {
    const { body } = await new OpenAiResponsesProvider(model, {
      config: {
        ...history,
        reasoning: { effort: 'high' },
        temperature: 0.3,
        top_p: 0.8,
        include: ['message.output_text.logprobs'],
      },
    }).getOpenAiBody('Say ready.');
    expect(body).toMatchObject({
      temperature: 0.3,
      top_p: 0.8,
      include: ['message.output_text.logprobs'],
    });

    const { body: defaults } = await new OpenAiResponsesProvider(model, {
      config: { ...history, reasoning: { effort: 'none' } },
    }).getOpenAiBody('Say ready.');
    expect(defaults).not.toHaveProperty('temperature');
    expect(defaults).not.toHaveProperty('top_p');

    const { body: updated } = await new OpenAiResponsesProvider(model, {
      config: { ...history, reasoning: { effort: 'none' }, temperature: 0.3 },
    }).getOpenAiBody(
      JSON.stringify([
        { type: 'configuration_update', reasoning: { effort: 'high' } },
        { role: 'user', content: 'Say ready.' },
      ]),
    );
    expect(updated).not.toHaveProperty('temperature');
  });

  it('uses request-level reasoning for linked native pro, multi-agent, and Bedrock responses', async () => {
    for (const [effort, keepsSampling] of [
      ['high', false],
      ['none', true],
    ] as const) {
      for (const provider of [
        new OpenAiResponsesProvider(model, {
          config: { reasoning: { effort, mode: 'pro' }, top_p: 0.8 },
        }),
        new OpenAiResponsesProvider(model, {
          config: {
            reasoning: { effort },
            top_p: 0.8,
            passthrough: { multi_agent: { enabled: true } },
          },
        }),
        createBedrockOpenAiResponsesProvider(`openai.${model}`, {
          config: { region: 'us-east-1', reasoning: { effort }, top_p: 0.8 },
        }),
        new OpenAiResponsesProvider(`openai.${model}`, {
          config: {
            apiBaseUrl: 'https://bedrock-mantle.us-east-1.api.aws/openai/v1',
            reasoning: { effort },
            top_p: 0.8,
          },
        }),
        new OpenAiResponsesProvider(`us.openai.${model}`, {
          config: {
            apiBaseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
            reasoning: { effort },
            top_p: 0.8,
          },
        }),
        new OpenAiResponsesProvider(`global.openai.${model}`, {
          config: {
            apiBaseUrl: 'https://bedrock-runtime.us-west-2.amazonaws.com/openai/v1',
            reasoning: { effort },
            top_p: 0.8,
          },
        }),
        ...[
          'bedrock-runtime.us-east-1.api.aws',
          'bedrock-runtime-fips.us-east-1.amazonaws.com',
          'bedrock-runtime-fips.us-east-1.api.aws',
        ].map(
          (hostname) =>
            new OpenAiResponsesProvider(`global.openai.${model}`, {
              config: {
                apiBaseUrl: `https://${hostname}/openai/v1`,
                reasoning: { effort },
                top_p: 0.8,
              },
            }),
        ),
      ]) {
        const context = {
          vars: {},
          prompt: {
            raw: 'Say ready.',
            label: 'ready',
            config: { previous_response_id: 'resp_previous' },
          },
        };
        const { body } = await provider.getOpenAiBody('Say ready.', context);
        const { body: ignoredUpdate } = await provider.getOpenAiBody(
          JSON.stringify([
            {
              type: 'configuration_update',
              reasoning: { effort: keepsSampling ? 'high' : 'none' },
            },
            { role: 'user', content: 'Say ready.' },
          ]),
          context,
        );
        for (const result of [body, ignoredUpdate]) {
          expect(result.reasoning.effort).toBe(effort);
          if (keepsSampling) {
            expect(result).toMatchObject({ temperature: 0, top_p: 0.8 });
          } else {
            expect(result).not.toHaveProperty('temperature');
            expect(result).not.toHaveProperty('top_p');
          }
        }
      }
    }

    const { body: singleAgent } = await new OpenAiResponsesProvider(model, {
      config: {
        previous_response_id: 'resp_previous',
        reasoning: { effort: 'high' },
        temperature: 0.3,
        passthrough: { multi_agent: { enabled: false } },
      },
    }).getOpenAiBody('Say ready.');
    expect(singleAgent.temperature).toBe(0.3);

    for (const hostname of [
      'bedrock-runtime.us-east-1.amazonaws.com.example',
      'bedrock-runtime.us-east-1.api.aws.example',
      'bedrock-runtime-fips.us-east-1.api.aws.example',
    ]) {
      const { body: lookalike } = await new OpenAiResponsesProvider(`us.openai.${model}`, {
        config: {
          apiBaseUrl: `https://${hostname}/openai/v1`,
          previous_response_id: 'resp_previous',
          reasoning: { effort: 'high' },
          temperature: 0.3,
        },
      }).getOpenAiBody('Say ready.');
      expect(lookalike.temperature).toBe(0.3);
    }
  });

  it('lets prompt-native reasoning aliases override provider reasoning before capability checks', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    for (const [providerEffort, promptEffort] of [
      ['high', 'none'],
      ['none', 'high'],
    ] as const) {
      const chat = new OpenAiChatCompletionProvider(model, {
        config: { reasoning_effort: providerEffort, temperature: 0.3 },
      });
      const { body: chatBody } = await chat.getOpenAiBody('Say ready.', {
        vars: { effort: promptEffort },
        prompt: {
          ...prompt,
          config: {
            ...(promptEffort === 'none' ? { tools: [statusTool] } : {}),
            passthrough: { reasoning_effort: '{{ effort }}' },
          },
        },
      });
      expect(chatBody.reasoning_effort).toBe(promptEffort);
      if (promptEffort === 'none') {
        expect(chatBody).toMatchObject({ tools: [statusTool], temperature: 0.3 });
      } else {
        expect(chatBody).not.toHaveProperty('temperature');
      }

      const responses = new OpenAiResponsesProvider(model, {
        config: { reasoning: { effort: providerEffort, summary: 'auto' }, temperature: 0.3 },
      });
      const { body: responseBody } = await responses.getOpenAiBody('Say ready.', {
        vars: { effort: promptEffort },
        prompt: {
          ...prompt,
          config: { passthrough: { reasoning: { effort: '{{ effort }}' } } },
        },
      });
      expect(responseBody.reasoning).toEqual({ effort: promptEffort, summary: 'auto' });
      if (promptEffort === 'none') {
        expect(responseBody.temperature).toBe(0.3);
      } else {
        expect(responseBody).not.toHaveProperty('temperature');
      }
    }

    const { body: sameLayer } = await new OpenAiResponsesProvider(model, {
      config: {
        reasoning_effort: 'high',
        reasoning: { summary: 'auto' },
        passthrough: { reasoning: { effort: 'none' } },
      },
    }).getOpenAiBody('Say ready.');
    expect(sameLayer.reasoning).toEqual({ effort: 'none', summary: 'auto' });

    const { body: cleared } = await new OpenAiResponsesProvider(model, {
      config: { reasoning: { effort: 'none', summary: 'auto' }, temperature: 0.3 },
    }).getOpenAiBody('Say ready.', {
      vars: {},
      prompt: { ...prompt, config: { passthrough: { reasoning: { effort: null } } } },
    });
    expect(cleared.reasoning).toEqual({ summary: 'auto' });
    expect(cleared).not.toHaveProperty('temperature');
  });

  it('renders dynamic Responses reasoning at each configuration layer before applying precedence', async () => {
    const providerReasoning = vi.fn(({ vars }: { vars: { providerEffort: string } }) => ({
      effort: vars.providerEffort,
      summary: 'auto',
    }));
    const promptReasoning = vi.fn(({ vars }: { vars: { promptEffort: string } }) => ({
      effort: vars.promptEffort,
    }));
    const provider = new OpenAiResponsesProvider(model, {
      config: { reasoning: providerReasoning as any, temperature: 0.3 },
    });
    const context = {
      vars: { providerEffort: 'high', promptEffort: 'none' },
      prompt: { raw: 'Say ready.', label: 'ready', config: { reasoning: promptReasoning as any } },
    };
    const { body } = await provider.getOpenAiBody('Say ready.', context);
    expect(body.reasoning).toEqual({ effort: 'none', summary: 'auto' });
    expect(body.temperature).toBe(0.3);
    expect(providerReasoning).toHaveBeenCalledTimes(1);
    expect(promptReasoning).toHaveBeenCalledTimes(1);

    const passthroughReasoning = vi.fn(({ vars }: { vars: { promptEffort: string } }) => ({
      effort: vars.promptEffort,
    }));
    const { body: fromPassthrough } = await provider.getOpenAiBody('Say ready.', {
      ...context,
      vars: { providerEffort: 'none', promptEffort: 'high' },
      prompt: { ...context.prompt, config: { passthrough: { reasoning: passthroughReasoning } } },
    });
    expect(fromPassthrough.reasoning).toEqual({ effort: 'high', summary: 'auto' });
    expect(fromPassthrough).not.toHaveProperty('temperature');
    expect(passthroughReasoning).toHaveBeenCalledTimes(1);
  });

  it('does not render a nested Responses effort overridden by the prompt', async () => {
    const rawEffort = '{{ budget | load }}';
    const prompt = { raw: 'Say ready.', label: 'ready' };
    for (const providerKind of ['openai', 'azure']) {
      for (const layer of ['reasoning', 'passthrough']) {
        const reasoning = { effort: rawEffort, summary: '{{ summary }}' };
        const config = {
          apiKey: 'test-key',
          ...(layer === 'reasoning'
            ? { reasoning: reasoning as any }
            : { passthrough: { reasoning } }),
        };
        const provider =
          providerKind === 'azure'
            ? new AzureResponsesProvider(model, { config })
            : new OpenAiResponsesProvider(model, { config });
        const context = {
          vars: { summary: 'auto' },
          prompt: { ...prompt, config: { reasoning: { effort: 'none' as const } } },
        };
        const body =
          provider instanceof AzureResponsesProvider
            ? await provider.getAzureResponsesBody(prompt.raw, context)
            : (await provider.getOpenAiBody(prompt.raw, context)).body;
        expect(body.reasoning).toEqual({ effort: 'none', summary: 'auto' });
        expect(reasoning.effort).toBe(rawEffort);

        const unresolvedContext = { vars: { summary: 'auto' }, prompt };
        const unresolved =
          provider instanceof AzureResponsesProvider
            ? provider.getAzureResponsesBody(prompt.raw, unresolvedContext)
            : provider.getOpenAiBody(prompt.raw, unresolvedContext);
        await expect(unresolved).rejects.toThrow();
      }
    }

    const provider = new OpenAiResponsesProvider(model, {
      config: {
        reasoning: { effort: 'none' },
        passthrough: { reasoning: { effort: rawEffort, summary: '{{ summary }}' } },
      },
    });
    const { body } = await provider.getOpenAiBody(prompt.raw, {
      vars: { summary: 'auto' },
      prompt,
    });
    expect(body.reasoning).toEqual({ effort: 'none', summary: 'auto' });
  });

  it('renders only the selected GPT-6 Chat reasoning callback, once', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    for (const providerModel of [
      { Provider: OpenAiChatCompletionProvider, name: model },
      { Provider: OpenRouterProvider, name: `openai/${model}` },
    ]) {
      const selected = vi.fn(({ vars }: { vars: { effort: string } }) => vars.effort);
      const provider = new providerModel.Provider(providerModel.name, {
        config: { reasoning_effort: selected as any, temperature: 0.3 },
      });
      const { body } = await provider.getOpenAiBody(prompt.raw, {
        vars: { effort: 'none' },
        prompt,
      });
      expect(body).toMatchObject({ reasoning_effort: 'none', temperature: 0.3 });
      expect(selected).toHaveBeenCalledTimes(1);

      const overridden = vi.fn(() => {
        throw new Error('The overridden provider callback must not run');
      });
      const withOverride = new providerModel.Provider(providerModel.name, {
        config: { reasoning_effort: overridden as any, temperature: 0.3 },
      });
      for (const config of [
        { reasoning_effort: 'none' as const },
        { passthrough: { reasoning_effort: 'none' } },
      ]) {
        const { body: overriddenBody } = await withOverride.getOpenAiBody(prompt.raw, {
          vars: {},
          prompt: { ...prompt, config: { ...config, tools: [statusTool] } },
        });
        expect(overriddenBody).toMatchObject({ reasoning_effort: 'none', temperature: 0.3 });
      }
      const { body: reset } = await withOverride.getOpenAiBody(prompt.raw, {
        vars: {},
        prompt: { ...prompt, config: { passthrough: { reasoning_effort: null } } },
      });
      expect(reset).not.toHaveProperty('reasoning_effort');
      expect(overridden).not.toHaveBeenCalled();
    }
  });

  it('inherits a Chat effort when a higher-priority callback returns undefined', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    for (const [kind, Provider, name] of [
      ['OpenAI', OpenAiChatCompletionProvider, model],
      ['Azure', AzureChatCompletionProvider, model],
    ] as const) {
      for (const providerLayer of ['direct', 'passthrough']) {
        const omitted = vi.fn(() => undefined);
        const fallback = vi.fn(() => 'none');
        const provider = new Provider(name, {
          config: {
            apiKey: 'test-key',
            tools: [statusTool],
            temperature: 0.7,
            ...(providerLayer === 'direct'
              ? { reasoning_effort: fallback as any }
              : { passthrough: { reasoning_effort: fallback } }),
          },
        });
        const { body } = await provider.getOpenAiBody(prompt.raw, {
          vars: {},
          prompt: { ...prompt, config: { reasoning_effort: omitted as any } },
        });
        expect(body.reasoning_effort, kind).toBe('none');
        expect(body.temperature, kind).toBe(0.7);
        expect(body.tools, kind).toHaveLength(1);
        expect(omitted, kind).toHaveBeenCalledTimes(1);
        expect(fallback, kind).toHaveBeenCalledTimes(1);
      }
      for (const reset of [null, '']) {
        const fallback = vi.fn(() => 'none');
        const provider = new Provider(name, {
          config: { apiKey: 'test-key', temperature: 0.7, reasoning_effort: fallback as any },
        });
        const { body } = await provider.getOpenAiBody(prompt.raw, {
          vars: {},
          prompt: { ...prompt, config: { reasoning_effort: (() => reset) as any } },
        });
        expect(body).not.toHaveProperty('reasoning_effort');
        expect(body).not.toHaveProperty('temperature');
        expect(fallback).not.toHaveBeenCalled();
      }
    }
  });

  it('treats empty OpenRouter effort values as prompt-level resets', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    const provider = new OpenRouterProvider(`openai/${model}`, {
      config: { reasoning_effort: 'none', temperature: 0.8 },
    });
    for (const config of [
      { reasoning_effort: '' },
      { passthrough: { reasoning_effort: '' } },
      { passthrough: { reasoning: { effort: '' } } },
      { reasoning_effort: '{{ optional }}' },
      { passthrough: { reasoning: { effort: '{{ optional }}' } } },
    ]) {
      const { body } = await provider.getOpenAiBody(prompt.raw, {
        vars: {},
        prompt: { ...prompt, config: config as any },
      });
      expect(body).not.toHaveProperty('reasoning_effort');
      expect(body.reasoning ?? {}).not.toHaveProperty('effort');
      expect(body).not.toHaveProperty('temperature');
    }
  });

  it('leaves Azure OpenAI Chat caps and reasoning defaults to the GPT-6 model', async () => {
    for (const [deployment, config] of [
      [`prod-${model}`, {}],
      ['production', { modelName: model }],
    ] as const) {
      const provider = new AzureChatCompletionProvider(deployment, { config });
      const { body } = await provider.getOpenAiBody('Say ready.');
      expect(body).not.toHaveProperty('max_completion_tokens');
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('reasoning_effort');

      const { body: configured } = await new AzureChatCompletionProvider(deployment, {
        config: { ...config, max_tokens: 2500, reasoning_effort: 'none' },
      }).getOpenAiBody('Say ready.');
      expect(configured).toMatchObject({ max_completion_tokens: 2500, reasoning_effort: 'none' });
    }

    for (const [override, expected] of [
      [{ OPENAI_MAX_TOKENS: '3000' }, 3000],
      [{ OPENAI_MAX_TOKENS: '3000', OPENAI_MAX_COMPLETION_TOKENS: '4000' }, 4000],
    ] as const) {
      const restore = mockProcessEnv(override);
      try {
        const { body } = await new AzureChatCompletionProvider(`prod-${model}`).getOpenAiBody(
          'Say ready.',
        );
        expect(body.max_completion_tokens).toBe(expected);
      } finally {
        restore();
      }
    }
  });

  it('resolves Azure OpenAI Chat output caps by prompt, provider, then environment', async () => {
    const restore = mockProcessEnv({
      OPENAI_MAX_COMPLETION_TOKENS: '900',
      OPENAI_MAX_TOKENS: '950',
    });
    const prompt = { raw: 'Say ready.', label: 'ready' };
    try {
      for (const [providerConfig, promptConfig, expected] of [
        [{}, {}, 900],
        [{ max_tokens: 50 }, {}, 50],
        [{ passthrough: { max_tokens: 60 } }, {}, 60],
        [{ max_completion_tokens: 400 }, { max_tokens: 50 }, 50],
        [{ passthrough: { max_completion_tokens: 400 } }, { max_completion_tokens: 50 }, 50],
        [{ passthrough: { max_completion_tokens: 400 } }, { passthrough: { max_tokens: 50 } }, 50],
        [{ max_tokens: 400 }, { passthrough: { max_completion_tokens: 50 } }, 50],
        [{ max_tokens: 400 }, { passthrough: { max_tokens: null } }, undefined],
        [{ max_tokens: 400 }, { max_completion_tokens: null }, undefined],
        [{ max_tokens: 40, max_completion_tokens: 50, passthrough: { max_tokens: 60 } }, {}, 50],
        [
          { max_tokens: 40, max_completion_tokens: 50, passthrough: { max_completion_tokens: 70 } },
          {},
          70,
        ],
      ] as const) {
        for (const [deployment, modelConfig] of [
          [`prod-${model}`, {}],
          ['opaque', { modelName: model }],
        ] as const) {
          const provider = new AzureChatCompletionProvider(deployment, {
            config: { ...modelConfig, ...providerConfig } as any,
          });
          const { body } = await provider.getOpenAiBody(prompt.raw, {
            vars: {},
            prompt: { ...prompt, config: promptConfig as any },
          });
          if (expected === undefined) {
            expect(body).not.toHaveProperty('max_completion_tokens');
          } else {
            expect(body.max_completion_tokens).toBe(expected);
          }
          expect(body).not.toHaveProperty('max_tokens');
        }
      }
    } finally {
      restore();
    }
  });

  it('applies prompt-level OpenAI reasoning before Azure capability validation', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    for (const [baseline, effort] of [
      ['high', 'none'],
      ['none', 'high'],
    ] as const) {
      for (const [base, override] of [
        [{ passthrough: { reasoning_effort: baseline } }, { reasoning_effort: effort }],
        [{ reasoning_effort: baseline }, { passthrough: { reasoning_effort: effort } }],
      ]) {
        const { body } = await new AzureChatCompletionProvider(`prod-${model}`, {
          config: { ...base, temperature: 0.3 },
        }).getOpenAiBody(prompt.raw, { vars: {}, prompt: { ...prompt, config: override } });
        expect(body.reasoning_effort).toBe(effort);
        if (effort === 'none') {
          expect(body.temperature).toBe(0.3);
        } else {
          expect(body).not.toHaveProperty('temperature');
        }
      }

      for (const override of [
        { reasoning_effort: effort },
        { reasoning: { effort } },
        { passthrough: { reasoning: { effort } } },
      ]) {
        const body = await new AzureResponsesProvider(`prod-${model}`, {
          config: {
            passthrough: { reasoning: { effort: baseline, summary: 'auto' } },
            temperature: 0.3,
          },
        }).getAzureResponsesBody(prompt.raw, { vars: {}, prompt: { ...prompt, config: override } });
        expect(body.reasoning).toEqual({ effort, summary: 'auto' });
        if (effort === 'none') {
          expect(body.temperature).toBe(0.3);
        } else {
          expect(body).not.toHaveProperty('temperature');
        }
      }
    }

    const shadowed = vi.fn(() => {
      throw new Error('The Azure effort is overridden');
    });
    const chat = new AzureChatCompletionProvider(`prod-${model}`, {
      config: { reasoning_effort: shadowed as any },
    });
    const responses = new AzureResponsesProvider(`prod-${model}`, {
      config: {
        reasoning_effort: shadowed as any,
        passthrough: { reasoning: { summary: 'auto' } },
      },
    });
    const override = {
      vars: {},
      prompt: { ...prompt, config: { reasoning_effort: 'high' as const } },
    };
    expect((await chat.getOpenAiBody(prompt.raw, override)).body.reasoning_effort).toBe('high');
    expect((await responses.getAzureResponsesBody(prompt.raw, override)).reasoning).toEqual({
      effort: 'high',
      summary: 'auto',
    });
    expect(shadowed).not.toHaveBeenCalled();

    const reset = await responses.getAzureResponsesBody(prompt.raw, {
      vars: {},
      prompt: { ...prompt, config: { passthrough: { reasoning: null } } },
    });
    expect(reset).not.toHaveProperty('reasoning');
    expect(shadowed).not.toHaveBeenCalled();
  });

  it('does not evaluate provider Responses reasoning when the prompt resets the object', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    const overridden = vi.fn(() => {
      throw new Error('The overridden provider callback must not run');
    });
    const provider = new OpenAiResponsesProvider(model, {
      config: { reasoning: overridden as any, temperature: 0.3 },
    });
    for (const config of [
      { reasoning: null },
      { passthrough: { reasoning: null } },
      { reasoning: (() => null) as any },
    ]) {
      const { body } = await provider.getOpenAiBody(prompt.raw, {
        vars: {},
        prompt: { ...prompt, config },
      });
      expect(body).not.toHaveProperty('reasoning');
      expect(body).not.toHaveProperty('temperature');
    }
    expect(overridden).not.toHaveBeenCalled();

    const shadowedAlias = vi.fn(() => {
      throw new Error('The overridden effort alias must not run');
    });
    const { body } = await new OpenAiResponsesProvider(model, {
      config: { reasoning: { effort: 'none' }, reasoning_effort: shadowedAlias as any },
    }).getOpenAiBody(prompt.raw, { vars: {}, prompt });
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(shadowedAlias).not.toHaveBeenCalled();
  });

  it('skips an overridden Responses effort callback and still merges provider options', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    for (const name of [model, 'gpt-6-astra']) {
      const lowerPriority = vi.fn(() => {
        throw new Error('The provider effort should not run for this prompt');
      });
      const provider = new OpenAiResponsesProvider(name, {
        config: { reasoning_effort: lowerPriority as any, reasoning: { summary: 'auto' } },
      });
      for (const config of [
        { reasoning_effort: 'high' as const },
        { reasoning: { effort: 'high' as const } },
        { passthrough: { reasoning: { effort: 'high' } } },
      ]) {
        const { body } = await provider.getOpenAiBody(prompt.raw, {
          vars: {},
          prompt: { ...prompt, config },
        });
        expect(body.reasoning).toEqual({ effort: 'high', summary: 'auto' });
      }
      expect(lowerPriority).not.toHaveBeenCalled();

      const selected = vi.fn(({ vars }: { vars: { effort: string } }) => vars.effort);
      const { body } = await new OpenAiResponsesProvider(name, {
        config: { reasoning_effort: selected as any, reasoning: { summary: 'auto' } },
      }).getOpenAiBody(prompt.raw, {
        vars: { effort: 'high' },
        prompt: { ...prompt, config: { reasoning: { summary: 'detailed' } } },
      });
      expect(body.reasoning).toEqual({ effort: 'high', summary: 'detailed' });
      expect(selected).toHaveBeenCalledTimes(1);
    }
  });

  it.each(['none', true, 3, ['none']])(
    'rejects invalid GPT-6 Responses reasoning %j rather than using the default',
    async (invalid) => {
      const prompt = { raw: 'Say ready.', label: 'ready' };
      for (const name of [model, 'gpt-6-astra']) {
        const config = { passthrough: { reasoning: invalid }, temperature: 0.3 };
        await expect(
          new OpenAiResponsesProvider(name, { config }).getOpenAiBody(prompt.raw),
        ).rejects.toThrow('GPT-6 Responses reasoning must be an object or null');
        await expect(
          new OpenAiResponsesProvider(name).getOpenAiBody(prompt.raw, {
            vars: {},
            prompt: { ...prompt, config },
          }),
        ).rejects.toThrow('GPT-6 Responses reasoning must be an object or null');
        await expect(
          new OpenAiResponsesProvider(name, {
            config: { reasoning: (() => invalid) as any },
          }).getOpenAiBody(prompt.raw, { vars: {}, prompt }),
        ).rejects.toThrow('GPT-6 Responses reasoning must be an object or null');
      }
    },
  );

  it.each([
    [{ max_tokens: 77 }, 77],
    [{ max_tokens: 77, max_completion_tokens: 88 }, 88],
    [{ passthrough: { max_tokens: 99 } }, 99],
    [{ max_completion_tokens: 88, passthrough: { max_tokens: 99 } }, 99],
    [{ max_tokens: 77, passthrough: { max_tokens: 99, max_completion_tokens: 111 } }, 111],
  ] as const)('preserves the effective explicit OpenRouter output cap', async (config, cap) => {
    const { body } = await new OpenRouterProvider(`openai/${model}`, { config }).getOpenAiBody(
      'Say ready.',
    );
    expect(body.max_completion_tokens).toBe(cap);
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('uses an explicit legacy OpenRouter token-limit environment value', async () => {
    const restoreTokenEnv = mockProcessEnv({ OPENAI_MAX_TOKENS: '99' });
    try {
      const { body } = await new OpenRouterProvider(`openai/${model}`, {
        config: {},
      }).getOpenAiBody('Say ready.');
      expect(body.max_completion_tokens).toBe(99);
      expect(body).not.toHaveProperty('max_tokens');
    } finally {
      restoreTokenEnv();
    }
  });

  it('uses the published default Bedrock Mantle region for the OpenAI model', () => {
    const bedrockModel = `openai.${model}`;
    const restoreAwsEnv = mockProcessEnv({
      AWS_BEDROCK_REGION: undefined,
      AWS_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
    });
    try {
      for (const provider of [
        new BedrockOpenAiResponsesProvider(bedrockModel),
        createBedrockOpenAiResponsesProvider(bedrockModel),
      ]) {
        expect(provider.getApiUrl()).toBe('https://bedrock-mantle.us-east-1.api.aws/openai/v1');
      }
      expect(() =>
        createBedrockOpenAiResponsesProvider(bedrockModel, { config: { region: 'us-east-2' } }),
      ).toThrow('Supported Regions: us-east-1');
      expect(
        createBedrockOpenAiResponsesProvider(bedrockModel, {
          config: { region: 'us-east-2', apiBaseUrl: 'https://proxy.example.com/openai/v1' },
        }).getApiUrl(),
      ).toBe('https://proxy.example.com/openai/v1');
    } finally {
      restoreAwsEnv();
    }
  });

  it('checks the selected AWS region before applying a Bedrock prompt model override', async () => {
    const restoreAwsEnv = mockProcessEnv({
      AWS_BEDROCK_REGION: undefined,
      AWS_REGION: undefined,
      AWS_DEFAULT_REGION: undefined,
    });
    try {
      const initialModel = 'openai.gpt-5.6-terra';
      const overriddenModel = `openai.${model}`;
      const context = (effectiveModel: string) => ({
        vars: {},
        prompt: {
          raw: 'Say ready.',
          label: 'ready',
          config: { passthrough: { model: effectiveModel } },
        },
      });
      for (const provider of [
        new BedrockOpenAiResponsesProvider(initialModel),
        createBedrockOpenAiResponsesProvider(initialModel),
        createBedrockOpenAiResponsesProvider(initialModel, { config: { region: 'us-west-2' } }),
      ]) {
        await expect(
          provider.getOpenAiBody('Say ready.', context(overriddenModel)),
        ).rejects.toThrow('Set the provider config.region to us-east-1');
        expect(provider.getApiUrl()).not.toContain('us-east-1');
        const { body } = await provider.getOpenAiBody('Say ready.', context('openai.gpt-5.6-luna'));
        expect(body.model).toBe('openai.gpt-5.6-luna');
      }
      for (const config of [
        { region: 'us-east-1' },
        { region: 'us-east-2', apiBaseUrl: 'https://proxy.example.com/openai/v1' },
      ]) {
        const provider = createBedrockOpenAiResponsesProvider(initialModel, { config });
        const { body } = await provider.getOpenAiBody('Say ready.', context(overriddenModel));
        expect(body.model).toBe(overriddenModel);
      }
    } finally {
      restoreAwsEnv();
    }
  });

  it('requires an OpenAI frontier route when switching an existing Bedrock provider per prompt', async () => {
    const target = `openai.${model}`;
    const context = {
      vars: {},
      prompt: { raw: 'Say ready.', label: 'ready', config: { passthrough: { model: target } } },
    };
    for (const provider of [
      createBedrockOpenAiResponsesProvider('openai.gpt-oss-120b', {
        config: { region: 'us-east-1' },
      }),
      createBedrockOpenAiResponsesProvider('openai.gpt-oss-20b', {
        config: { region: 'us-east-1', apiBaseUrl: 'https://proxy.example.test/openai/v1' },
      }),
      createBedrockOpenAiResponsesProvider('xai.grok-4.3', { config: { region: 'us-west-2' } }),
    ]) {
      await expect(provider.getOpenAiBody('Say ready.', context)).rejects.toThrow(
        `Configure a separate provider using bedrock:responses:${target}`,
      );
    }
    const wrongPath = createBedrockOpenAiResponsesProvider('openai.gpt-5.6-terra', {
      config: { region: 'us-east-1', apiBaseUrl: 'https://bedrock-mantle.us-east-1.api.aws/v1' },
    });
    await expect(wrongPath.getOpenAiBody('Say ready.', context)).rejects.toThrow(
      'requires the /openai/v1 Mantle endpoint',
    );
    const frontier = createBedrockOpenAiResponsesProvider('openai.gpt-5.6-terra', {
      config: { region: 'us-east-1' },
    });
    expect((await frontier.getOpenAiBody('Say ready.', context)).body.model).toBe(target);
  });

  it.each(['none', 'high'] as const)(
    'preserves a prompt-level Bedrock OpenAI model override with %s reasoning',
    async (effort) => {
      const bedrockModel = `openai.${model}`;
      const provider = createBedrockOpenAiResponsesProvider('openai.gpt-5.6-terra', {
        config: { region: 'us-east-1' },
      });
      const { body } = await provider.getOpenAiBody('Say ready.', {
        vars: {},
        prompt: {
          raw: 'Say ready.',
          label: 'ready',
          config: { reasoning: { effort }, temperature: 0.3, passthrough: { model: bedrockModel } },
        },
      });
      expect(body).toMatchObject({ model: bedrockModel, reasoning: { effort } });
      if (effort === 'none') {
        expect(body.temperature).toBe(0.3);
      } else {
        expect(body).not.toHaveProperty('temperature');
      }
    },
  );

  it('reconciles OpenRouter reasoning aliases using the most specific configuration', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    const baseNested = new OpenRouterProvider(`openai/${model}`, {
      config: { temperature: 0.4, passthrough: { reasoning: { effort: 'high', exclude: true } } },
    });
    const { body: directOverride } = await baseNested.getOpenAiBody('Say ready.', {
      vars: { effort: 'none' },
      prompt: { ...prompt, config: { reasoning_effort: '{{ effort }}' } },
    });
    expect(directOverride).toMatchObject({
      reasoning: { effort: 'none', exclude: true },
      temperature: 0.4,
    });
    expect(directOverride).not.toHaveProperty('reasoning_effort');

    const baseDirect = new OpenRouterProvider(`openai/${model}`, {
      config: { reasoning_effort: 'high', temperature: 0.4 },
    });
    const { body: nestedOverride } = await baseDirect.getOpenAiBody('Say ready.', {
      vars: {},
      prompt: {
        ...prompt,
        config: { passthrough: { reasoning: { effort: 'none', exclude: true } } },
      },
    });
    expect(nestedOverride).toMatchObject({
      reasoning: { effort: 'none', exclude: true },
      temperature: 0.4,
    });
    expect(nestedOverride).not.toHaveProperty('reasoning_effort');

    const { body: sameLayer } = await new OpenRouterProvider(`openai/${model}`, {
      config: {
        reasoning_effort: 'high',
        temperature: 0.4,
        passthrough: { reasoning: { effort: 'none', exclude: false } },
      },
    }).getOpenAiBody('Say ready.');
    expect(sameLayer.reasoning).toEqual({ effort: 'high', exclude: false });
    expect(sameLayer).not.toHaveProperty('reasoning_effort');
    expect(sameLayer).not.toHaveProperty('temperature');
  });

  it('allows prompt-level OpenRouter nulls to restore default reasoning and clear output limits', async () => {
    const restoreTokenEnv = mockProcessEnv({
      OPENAI_MAX_COMPLETION_TOKENS: '700',
      OPENAI_MAX_TOKENS: '800',
    });
    try {
      const prompt = { raw: 'Say ready.', label: 'ready' };
      for (const effort of ['none', 'high'] as const) {
        const provider = new OpenRouterProvider(`openai/${model}`, {
          config: {
            temperature: 0.4,
            passthrough: {
              reasoning: { effort, enabled: effort !== 'none', exclude: true },
              max_completion_tokens: 64,
            },
          },
        });
        for (const reasoningReset of [
          { reasoning_effort: null },
          { reasoning: { effort: null } },
          { reasoning: null },
        ]) {
          for (const tokenReset of [{ max_completion_tokens: null }, { max_tokens: null }]) {
            const { body } = await provider.getOpenAiBody('Say ready.', {
              vars: {},
              prompt: {
                ...prompt,
                config: { passthrough: { ...reasoningReset, ...tokenReset } },
              },
            });
            expect(body).not.toHaveProperty('reasoning_effort');
            expect(body).not.toHaveProperty('reasoning.effort');
            expect(body).not.toHaveProperty('reasoning.enabled');
            if ('reasoning' in reasoningReset && reasoningReset.reasoning === null) {
              expect(body).not.toHaveProperty('reasoning');
            } else {
              expect(body.reasoning).toEqual({ exclude: true });
            }
            expect(body).not.toHaveProperty('temperature');
            expect(body).not.toHaveProperty('max_completion_tokens');
            expect(body).not.toHaveProperty('max_tokens');
          }
        }
        const { body: inherited } = await provider.getOpenAiBody('Say ready.', {
          vars: {},
          prompt: { ...prompt, config: { passthrough: { logprobs: true } } },
        });
        expect(inherited.reasoning.effort).toBe(effort);
        expect(inherited.max_completion_tokens).toBe(64);
      }
      const { body: directBaseCleared } = await new OpenRouterProvider(`openai/${model}`, {
        config: { reasoning_effort: 'none', max_completion_tokens: 50 },
      }).getOpenAiBody('Say ready.', {
        vars: {},
        prompt: {
          ...prompt,
          config: { passthrough: { reasoning_effort: null, max_tokens: null } },
        },
      });
      expect(directBaseCleared).not.toHaveProperty('reasoning_effort');
      expect(directBaseCleared).not.toHaveProperty('max_completion_tokens');
    } finally {
      restoreTokenEnv();
    }
  });

  it('treats an OpenRouter reasoning budget and named effort as alternative controls', async () => {
    const prompt = { raw: 'Say ready.', label: 'ready' };
    const effortProvider = new OpenRouterProvider(`openai/${model}`, {
      config: {
        temperature: 0.4,
        passthrough: { reasoning: { effort: 'none', exclude: true } },
      },
    });
    const { body: budget } = await effortProvider.getOpenAiBody('Say ready.', {
      vars: {},
      prompt: { ...prompt, config: { passthrough: { reasoning: { max_tokens: 2_000 } } } },
    });
    expect(budget.reasoning).toEqual({ max_tokens: 2_000, exclude: true });
    expect(budget).not.toHaveProperty('reasoning_effort');
    expect(budget).not.toHaveProperty('temperature');

    const budgetProvider = new OpenRouterProvider(`openai/${model}`, {
      config: {
        temperature: 0.4,
        passthrough: { reasoning: { max_tokens: 2_000, exclude: true } },
      },
    });
    for (const override of [
      { reasoning_effort: 'none' },
      { passthrough: { reasoning: { effort: 'none' } } },
      { passthrough: { reasoning: { enabled: false } } },
    ]) {
      const { body } = await budgetProvider.getOpenAiBody('Say ready.', {
        vars: {},
        prompt: { ...prompt, config: override },
      });
      expect(body.reasoning).not.toHaveProperty('max_tokens');
      expect(body.reasoning.exclude).toBe(true);
      expect(body.temperature).toBe(0.4);
    }
    const { body: cleared } = await budgetProvider.getOpenAiBody('Say ready.', {
      vars: {},
      prompt: { ...prompt, config: { passthrough: { reasoning: { max_tokens: null } } } },
    });
    expect(cleared.reasoning).toEqual({ exclude: true });
    expect(cleared).not.toHaveProperty('temperature');
  });

  it.each([
    [{ reasoning_effort: 'high' }, { passthrough: { reasoning_effort: 'none' } }, 'none'],
    [{ reasoning_effort: 'high' }, { passthrough: { reasoning: { enabled: false } } }, false],
    [{ reasoning_effort: 'none' }, { passthrough: { reasoning: { enabled: true } } }, true],
    [
      { passthrough: { reasoning: { effort: 'high', exclude: true } } },
      { passthrough: { reasoning_effort: '{{ effort }}' } },
      'none',
    ],
    [
      { passthrough: { reasoning: { enabled: false, exclude: true } } },
      { reasoning_effort: 'high' },
      'high',
    ],
  ] as const)(
    'applies prompt-level OpenRouter reasoning controls before provider aliases',
    async (base, override, expected) => {
      const provider = new OpenRouterProvider(`openai/${model}`, {
        config: { temperature: 0.4, top_p: 0.8, ...base },
      });
      const { body } = await provider.getOpenAiBody('Say ready.', {
        vars: { effort: 'none' },
        prompt: { raw: 'Say ready.', label: 'ready', config: override },
      });
      const nested = body.reasoning;
      if (typeof expected === 'boolean') {
        expect(nested).toMatchObject({ enabled: expected });
        expect(nested).not.toHaveProperty('effort');
        expect(body).not.toHaveProperty('reasoning_effort');
      } else {
        expect(nested?.effort ?? body.reasoning_effort).toBe(expected);
        expect(nested?.enabled).not.toBe(expected === 'none');
      }
      if ('passthrough' in base && base.passthrough.reasoning?.exclude) {
        expect(nested).toHaveProperty('exclude', true);
      }
      if (expected === false || expected === 'none') {
        expect(body).toMatchObject({ temperature: 0.4, top_p: 0.8 });
      } else {
        expect(body).not.toHaveProperty('temperature');
        expect(body).not.toHaveProperty('top_p');
      }
    },
  );

  it.each([
    [{ max_completion_tokens: 900 }, { max_tokens: 25 }],
    [{ max_tokens: 900 }, { max_completion_tokens: 25 }],
    [{ passthrough: { max_tokens: 900 } }, { max_completion_tokens: 25 }],
    [{ passthrough: { max_completion_tokens: 900 } }, { max_tokens: 25 }],
    [{ max_completion_tokens: 900 }, { passthrough: { max_tokens: 25 } }],
    [{ max_tokens: 900 }, { passthrough: { max_completion_tokens: 25 } }],
  ] as const)(
    'applies prompt-level OpenRouter token caps before provider aliases',
    async (base, override) => {
      const provider = new OpenRouterProvider(`openai/${model}`, { config: base });
      const { body } = await provider.getOpenAiBody('Say ready.', {
        vars: {},
        prompt: { raw: 'Say ready.', label: 'ready', config: override },
      });
      expect(body.max_completion_tokens).toBe(25);
      expect(body).not.toHaveProperty('max_tokens');
    },
  );

  it('supports the verified OpenRouter endpoint through a generic OpenAI Chat provider', async () => {
    const config = {
      reasoning_effort: 'high',
      tools: [statusTool],
      max_tokens: 23,
      temperature: 0.4,
      passthrough: { reasoning: { effort: 'high', exclude: true } },
    } as const;
    const { body } = await new OpenAiChatCompletionProvider(`openai/${model}`, {
      config: { ...config, tools: [statusTool], apiBaseUrl: 'https://openrouter.ai/api/v1' },
    }).getOpenAiBody('Get the status.');
    expect(body).toMatchObject({
      model: `openai/${model}`,
      tools: [statusTool],
      max_completion_tokens: 23,
      reasoning: { effort: 'high', exclude: true },
    });
    expect(body).not.toHaveProperty('temperature');

    for (const apiBaseUrl of [
      'https://api.openai.com/v1',
      'https://openrouter.ai.example.com/v1',
    ]) {
      await expect(
        new OpenAiChatCompletionProvider(`openai/${model}`, {
          config: { ...config, tools: [statusTool], apiBaseUrl },
        }).getOpenAiBody('Get the status.'),
      ).rejects.toThrow('Chat Completions requests use reasoning_effort');
    }

    const { body: proxied } = await new OpenRouterProvider(`openai/${model}`, {
      config: { ...config, tools: [statusTool], apiBaseUrl: 'https://proxy.example.com/v1' },
    }).getOpenAiBody('Get the status.');
    expect(proxied.tools).toEqual([statusTool]);
  });

  it.each([':nitro', ':floor', '-2026-09-22:nitro'])(
    'preserves OpenRouter reasoning, tools, and token limits with routing suffix %s',
    async (suffix) => {
      const routedModel = `openai/${model}${suffix}`;
      const { body } = await new OpenRouterProvider(routedModel, {
        config: { reasoning_effort: 'high', max_completion_tokens: 200, tools: [statusTool] },
      }).getOpenAiBody('Get the status.');
      expect(body).toMatchObject({
        model: routedModel,
        reasoning_effort: 'high',
        max_completion_tokens: 200,
        tools: [statusTool],
      });
      expect(body).not.toHaveProperty('max_tokens');
      expect(body).not.toHaveProperty('temperature');

      const { body: disabled } = await new OpenRouterProvider(routedModel, {
        config: { reasoning_effort: 'none', max_tokens: 444, temperature: 0.4 },
      }).getOpenAiBody('Say ready.');
      expect(disabled).toMatchObject({
        model: routedModel,
        reasoning_effort: 'none',
        max_completion_tokens: 444,
        temperature: 0.4,
      });
      expect(disabled).not.toHaveProperty('max_tokens');
    },
  );

  it.each([false, true])(
    'uses OpenRouter reasoning.enabled=%s when no effort was set',
    async (enabled) => {
      const { body } = await new OpenRouterProvider(`openai/${model}`, {
        config: {
          temperature: 0.4,
          top_p: 0.8,
          passthrough: { reasoning: { enabled, exclude: true }, logprobs: true, top_logprobs: 2 },
        },
      }).getOpenAiBody('Say ready.');
      expect(body.reasoning).toEqual({ enabled, exclude: true });
      for (const [key, value] of Object.entries({
        temperature: 0.4,
        top_p: 0.8,
        logprobs: true,
        top_logprobs: 2,
      })) {
        if (enabled) {
          expect(body).not.toHaveProperty(key);
        } else {
          expect(body).toHaveProperty(key, value);
        }
      }
    },
  );

  it.each([
    ['high', ['high', 'none'], true],
    ['none', ['none', 'high'], false],
  ] as const)(
    'uses OpenRouter Chat message effort updates after request effort %s',
    async (baseline, updates, sampling) => {
      const messages = updates.flatMap((effort, index) => [
        {
          role: index ? 'developer' : 'system',
          content: '',
          configuration_update: { reasoning: { effort } },
        },
        { role: 'user', content: 'Say ready.' },
      ]);
      const config = { reasoning_effort: baseline, temperature: 0.4, top_p: 0.8 };
      const { body } = await new OpenRouterProvider(`openai/${model}`, {
        config,
      }).getOpenAiBody(JSON.stringify(messages));
      expect(body.messages).toEqual(messages);
      expect(body.reasoning_effort).toBe(baseline);
      if (sampling) {
        expect(body).toMatchObject({ temperature: 0.4, top_p: 0.8 });
      } else {
        expect(body).not.toHaveProperty('temperature');
        expect(body).not.toHaveProperty('top_p');
      }

      const { body: native } = await new OpenAiChatCompletionProvider(model, {
        config,
      }).getOpenAiBody(JSON.stringify(messages));
      if (baseline === 'none') {
        expect(native.temperature).toBe(0.4);
      } else {
        expect(native).not.toHaveProperty('temperature');
      }
    },
  );

  it('ignores invalid OpenRouter message shapes and validates recognized effort updates', async () => {
    const provider = new OpenRouterProvider(`openai/${model}`, {
      config: { temperature: 0.4, passthrough: { reasoning: { enabled: false } } },
    });
    const configured = { reasoning: { effort: 'high' } };
    const { body } = await provider.getOpenAiBody(
      JSON.stringify([
        { role: 'user', content: '', configuration_update: configured },
        { role: 'system', content: 'not empty', configuration_update: configured },
        { role: 'user', content: 'Say ready.' },
      ]),
    );
    expect(body.temperature).toBe(0.4);

    const validShape = (effort: string) =>
      JSON.stringify([
        { role: 'system', content: '', configuration_update: { reasoning: { effort } } },
        { role: 'user', content: 'Say ready.' },
      ]);
    expect((await provider.getOpenAiBody(validShape('high'))).body).not.toHaveProperty(
      'temperature',
    );
    await expect(provider.getOpenAiBody(validShape('ultra'))).rejects.toThrow(
      'supports reasoning effort none, low, medium, high, xhigh, or max',
    );
  });

  it('preserves OpenAI reasoning, sampling, and valid function tools through TrueFoundry', async () => {
    const gatewayModel = `openai-main/${model}`;
    const { body } = await new TrueFoundryProvider(gatewayModel, {
      config: {
        reasoning_effort: 'none',
        temperature: 0.4,
        max_completion_tokens: 200,
        tools: [statusTool],
        tool_choice: 'required',
      },
    }).getOpenAiBody('Get the status.');
    expect(body).toMatchObject({
      model: gatewayModel,
      reasoning_effort: 'none',
      temperature: 0.4,
      max_completion_tokens: 200,
      tools: [statusTool],
      tool_choice: 'required',
    });
    expect(body).not.toHaveProperty('max_tokens');

    const high = new TrueFoundryProvider(gatewayModel, {
      config: { reasoning_effort: 'high', temperature: 0.4 },
    });
    const { body: highBody } = await high.getOpenAiBody('Say ready.');
    expect(highBody.reasoning_effort).toBe('high');
    expect(highBody).not.toHaveProperty('temperature');
    await expect(
      high.getOpenAiBody('Get the status.', {
        vars: {},
        prompt: { raw: 'Get the status.', label: 'status', config: { tools: [statusTool] } },
      }),
    ).rejects.toThrow('Chat Completions function calling requires reasoning_effort: none');
  });

  it('uses the final gateway model segment when an account name contains an OpenAI GPT-6 model', async () => {
    const gatewayModel = `${model}-prod/gpt-4.1`;
    const config = { temperature: 0.4, top_p: 0.8, tools: [statusTool] };
    const { body: chat } = await new TrueFoundryProvider(gatewayModel, {
      config,
    }).getOpenAiBody('Get the status.');
    expect(chat).toMatchObject({ model: gatewayModel, ...config });
    expect(chat).not.toHaveProperty('reasoning_effort');

    const { body: responses } = await new OpenAiResponsesProvider(gatewayModel, {
      config: { temperature: 0.4, top_p: 0.8 },
    }).getOpenAiBody('Say ready.');
    expect(responses).toMatchObject({ model: gatewayModel, temperature: 0.4, top_p: 0.8 });
    expect(responses).not.toHaveProperty('reasoning');

    const { body: azure } = await new AzureChatCompletionProvider(`prod-${model}`, {
      config: { reasoning_effort: 'high', temperature: 0.4 },
    }).getOpenAiBody('Say ready.');
    expect(azure.reasoning_effort).toBe('high');
    expect(azure).not.toHaveProperty('temperature');
  });

  it('keeps GPT-4.1 request parameters when the TrueFoundry account contains GPT-6', async () => {
    const gatewayModel = `${model}-prod/gpt-4.1`;
    const { body } = await new TrueFoundryProvider(gatewayModel, {
      config: { reasoning_effort: 'none', max_tokens: 77 },
    }).getOpenAiBody('Say ready.');
    expect(body).toMatchObject({ model: gatewayModel, max_tokens: 77 });
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(body).not.toHaveProperty('max_completion_tokens');

    const { body: reasoningBody } = await new TrueFoundryProvider(gatewayModel, {
      config: { reasoning: { effort: 'high' } },
    }).getOpenAiBody('Say ready.');
    expect(reasoningBody.model).toBe(gatewayModel);
  });

  it('keeps GPT-5.6 reasoning sampling rules when the TrueFoundry account contains GPT-6', async () => {
    const gatewayModel = `${model}-prod/gpt-5.6-terra`;
    const { body } = await new TrueFoundryProvider(gatewayModel, {
      config: { reasoning_effort: 'high', temperature: 0.4 },
    }).getOpenAiBody('Say ready.');
    expect(body).toMatchObject({ model: gatewayModel, reasoning_effort: 'high' });
    expect(body).not.toHaveProperty('temperature');
  });

  it('allows Chat tools only with explicit none; Responses tools work with reasoning', async () => {
    const chat = new OpenAiChatCompletionProvider(model, {
      config: { reasoning_effort: 'none', tools: [statusTool], tool_choice: 'required' },
    });
    expect((await chat.getOpenAiBody('Get the status.')).body).toMatchObject({
      reasoning_effort: 'none',
      tools: [statusTool],
      tool_choice: 'required',
    });
    const legacy = new OpenAiChatCompletionProvider(model, {
      config: { reasoning_effort: 'none', functions: [statusTool.function], function_call: 'auto' },
    });
    expect((await legacy.getOpenAiBody('Get the status.')).body).toMatchObject({
      functions: [statusTool.function],
      function_call: 'auto',
    });

    for (const effort of [undefined, 'low', 'max'] as const) {
      for (const passthrough of [
        { tools: [statusTool] },
        { tools: [statusTool], tool_choice: 'auto' },
        { functions: [statusTool.function] },
        { functions: [statusTool.function], function_call: 'auto' },
      ]) {
        await expect(
          new OpenAiChatCompletionProvider(model, {
            config: { reasoning_effort: effort, passthrough },
          }).getOpenAiBody('Get the status.'),
        ).rejects.toThrow('Chat Completions function calling requires reasoning_effort: none');
      }
      const responses = new OpenAiResponsesProvider(model, {
        config: { reasoning: { effort }, tools: [statusTool], tool_choice: 'required' },
      });
      expect((await responses.getOpenAiBody('Get the status.')).body).toMatchObject({
        tools: [{ type: 'function', name: 'get_status' }],
        tool_choice: 'required',
      });
    }
  });

  it('omits empty Chat tool lists without rejecting reasoning', async () => {
    const passthrough = { tools: [], functions: [] };
    const { body } = await new OpenAiChatCompletionProvider(model, {
      config: { reasoning_effort: 'low', passthrough },
    }).getOpenAiBody('Say ready.');

    expect(body.reasoning_effort).toBe('low');
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('functions');
    expect(passthrough).toEqual({ tools: [], functions: [] });
  });

  it.each([
    ['tool_choice', 'tools', statusTool],
    ['function_call', 'functions', statusTool.function],
  ] as const)(
    'rejects an explicit native Chat %s without definitions regardless of reasoning',
    async (selector, definitions, definition) => {
      for (const Provider of [OpenAiChatCompletionProvider, AzureChatCompletionProvider]) {
        for (const effort of [undefined, 'high', 'none'] as const) {
          for (const selectorValue of ['none', 'auto']) {
            for (const list of [{}, { [definitions]: [] }]) {
              await expect(
                new Provider(model, {
                  config: {
                    reasoning_effort: effort,
                    passthrough: { [selector]: selectorValue, ...list },
                  },
                }).getOpenAiBody('Say ready.'),
              ).rejects.toThrow(`${selector} requires a non-empty ${definitions} list`);
            }
          }
        }
        const { body } = await new Provider(model, {
          config: {
            reasoning_effort: 'none',
            passthrough: { [selector]: 'none', [definitions]: [definition] },
          },
        }).getOpenAiBody('Say ready.');
        expect(body[selector]).toBe('none');
        expect(body[definitions]).toEqual([definition]);
      }
    },
  );

  it('uses the final per-prompt model and reasoning effort for sampling', async () => {
    const chatProvider = new OpenAiChatCompletionProvider('gpt-4.1');
    const responsesProvider = new OpenAiResponsesProvider('gpt-4.1');
    const prompt = { raw: 'Say ready.', label: 'ready' };
    const settings = { temperature: 0.4, top_p: 0.7 };
    const { body: chat } = await chatProvider.getOpenAiBody('Say ready.', {
      vars: { effort: 'none' },
      prompt: {
        ...prompt,
        config: {
          ...settings,
          reasoning_effort: '{{effort}}',
          passthrough: { model, reasoning_effort: 'high' },
        },
      },
    });
    const { body: responses } = await responsesProvider.getOpenAiBody('Say ready.', {
      vars: {},
      prompt: {
        ...prompt,
        config: {
          ...settings,
          reasoning_effort: 'high',
          passthrough: { model, reasoning: { effort: 'none' } },
        },
      },
    });
    expect(chat).toMatchObject({ model, reasoning_effort: 'none', ...settings });
    expect(responses).toMatchObject({ model, reasoning: { effort: 'none' }, ...settings });

    const { body: overridden } = await responsesProvider.getOpenAiBody('Say ready.', {
      vars: { effort: 'high' },
      prompt: {
        ...prompt,
        config: {
          ...settings,
          reasoning: { effort: '{{effort}}' },
          passthrough: { model, reasoning: { effort: 'none' } },
        },
      },
    });
    expect(overridden.reasoning).toEqual({ effort: 'high' });
    expect(overridden).not.toHaveProperty('temperature');
    expect(overridden).not.toHaveProperty('top_p');
  });

  it.each(['minimal', 'ultra', 'unknown'])('rejects unsupported %s reasoning', async (effort) => {
    await expect(
      new OpenAiChatCompletionProvider(model, {
        config: { passthrough: { reasoning_effort: effort } },
      }).getOpenAiBody('Say ready.'),
    ).rejects.toThrow('supports reasoning effort none, low, medium, high, xhigh, or max');
    await expect(
      new OpenAiResponsesProvider(model, {
        config: { passthrough: { reasoning: { effort } } },
      }).getOpenAiBody('Say ready.'),
    ).rejects.toThrow('supports reasoning effort none, low, medium, high, xhigh, or max');
  });

  it('rejects the other endpoint’s reasoning shape', async () => {
    await expect(
      new OpenAiChatCompletionProvider(model, {
        config: { passthrough: { reasoning: { effort: 'none' }, tools: [statusTool] } },
      }).getOpenAiBody('Say ready.'),
    ).rejects.toThrow('instead of passthrough.reasoning');
    await expect(
      new OpenAiResponsesProvider(model, {
        config: { passthrough: { reasoning_effort: 'none' } },
      }).getOpenAiBody('Say ready.'),
    ).rejects.toThrow('instead of passthrough.reasoning_effort');
  });

  it('applies the same model rules to named Azure OpenAI deployments', async () => {
    const config = {
      apiKey: 'test-key',
      reasoning_effort: 'none' as const,
      temperature: 0.3,
      top_p: 0.8,
      tools: [statusTool],
      tool_choice: 'required' as const,
    };
    const { body: chat } = await new AzureChatCompletionProvider('production', {
      config: { ...config, modelName: model },
    }).getOpenAiBody('Get the status.');
    const responses = await new AzureResponsesProvider(`prod-${model}`, {
      config,
    }).getAzureResponsesBody('Get the status.');

    expect(chat).toMatchObject({
      model: 'production',
      reasoning_effort: 'none',
      temperature: 0.3,
      top_p: 0.8,
      tools: [statusTool],
    });
    expect(responses).toMatchObject({
      model: `prod-${model}`,
      reasoning: { effort: 'none' },
      temperature: 0.3,
      top_p: 0.8,
      tools: [{ type: 'function', name: 'get_status' }],
    });

    await expect(
      new AzureChatCompletionProvider('production', {
        config: { ...config, modelName: model, reasoning_effort: 'low' },
      }).getOpenAiBody('Get the status.'),
    ).rejects.toThrow('Chat Completions function calling requires reasoning_effort: none');

    const reasoningResponses = await new AzureResponsesProvider(`prod-${model}`, {
      config: { ...config, reasoning_effort: 'low' },
    }).getAzureResponsesBody('Get the status.');
    expect(reasoningResponses).toMatchObject({
      reasoning: { effort: 'low' },
      tools: [{ type: 'function', name: 'get_status' }],
    });
    expect(reasoningResponses).not.toHaveProperty('temperature');
    expect(reasoningResponses).not.toHaveProperty('top_p');
    expect(calculateAzureCost(model, config, 1000, 100)).toBeUndefined();
  });
});
