import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';
import { calculateAzureCost } from '../../../src/providers/azure/util';
import { CloudflareGatewayOpenAiProvider } from '../../../src/providers/cloudflare-gateway';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
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
        { tool_choice: 'auto' },
        { functions: [statusTool.function] },
        { function_call: 'auto' },
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

  it.each([{ tool_choice: 'none' }, { function_call: 'none' }])(
    'rejects an explicit native Chat tool selector without definitions, as the endpoint does',
    async (passthrough) => {
      await expect(
        new OpenAiChatCompletionProvider(model, {
          config: { reasoning_effort: 'high', passthrough },
        }).getOpenAiBody('Say ready.'),
      ).rejects.toThrow('Chat Completions function calling requires reasoning_effort: none');
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
