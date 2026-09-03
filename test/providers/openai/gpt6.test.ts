import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AzureChatCompletionProvider } from '../../../src/providers/azure/chat';
import { AzureResponsesProvider } from '../../../src/providers/azure/responses';
import { calculateAzureCost } from '../../../src/providers/azure/util';
import { OpenAiChatCompletionProvider } from '../../../src/providers/openai/chat';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';
import { OpenRouterProvider } from '../../../src/providers/openrouter';
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

  it.each([OpenAiChatCompletionProvider, OpenAiResponsesProvider])(
    'removes unsupported parameters after a per-prompt model override in %s',
    async (Provider) => {
      const passthrough = {
        model: 'gpt-6-astra',
        temperature: 0.4,
        top_p: 0.8,
        logprobs: true,
        top_logprobs: 5,
        max_tokens: 100,
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
      expect(passthrough.temperature).toBe(0.4);
    },
  );

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
