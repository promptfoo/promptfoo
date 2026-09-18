import { Messages } from '@anthropic-ai/sdk/resources/messages';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, isCacheEnabled } from '../../../../src/cache';
import { registerGenerateDatasetTool } from '../../../../src/commands/mcp/tools/generateDataset';
import { AnthropicMessagesProvider } from '../../../../src/providers/anthropic/messages';
import { OpenAiChatCompletionProvider } from '../../../../src/providers/openai/chat';
import type { Message } from '@anthropic-ai/sdk/resources/messages';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('generateDataset tool', () => {
  let cacheWasEnabled: boolean;

  beforeEach(() => {
    cacheWasEnabled = isCacheEnabled();
    disableCache();
  });

  afterEach(() => {
    if (cacheWasEnabled) {
      enableCache();
    }
    vi.restoreAllMocks();
  });

  it.each(['advertised', 'typed'])(
    'generates through the actual Anthropic task (%s selector)',
    async (format) => {
      const create = vi
        .spyOn(Messages.prototype, 'create')
        .mockRejectedValue(new Error('Unexpected Anthropic SDK call'));
      for (const output of [
        { personas: ['A curious reader'] },
        { vars: [{ topic: 'gardening' }] },
      ]) {
        create.mockResolvedValueOnce({
          model: 'claude-sonnet-5',
          content: [{ type: 'text', text: JSON.stringify(output) }],
          usage: { input_tokens: 1, output_tokens: 1 },
          stop_reason: 'end_turn',
        } as Message);
      }
      const callApi = vi.spyOn(AnthropicMessagesProvider.prototype, 'callApi');
      const tool = vi.fn();
      registerGenerateDatasetTool({ tool } as unknown as McpServer);
      const [, schema, handler] = tool.mock.calls[0];
      const advertisedMatch = schema.provider.description.match(/"(anthropic:[^"]+)"/);
      expect(advertisedMatch).not.toBeNull();
      const provider =
        format === 'advertised' ? advertisedMatch![1] : 'anthropic:messages:claude-sonnet-5';

      const result = await handler({ prompt: 'Discuss {{topic}}', provider, numSamples: 1 });
      const response = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(false);
      expect(response.data.dataset).toEqual([{ vars: { topic: 'gardening' } }]);
      expect(create).toHaveBeenCalledTimes(2);
      for (const [request] of create.mock.calls) {
        expect(request.model).toBe('claude-sonnet-5');
      }
      expect(callApi.mock.contexts[0]).toBeInstanceOf(AnthropicMessagesProvider);
    },
  );

  it.each(['gpt-4.1-mini', 'team/served-model:revision-1'])(
    'preserves the OpenAI chat model on the request: %s',
    async (model) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('Unexpected HTTP request'));
      for (const output of [
        { personas: ['A curious reader'] },
        { vars: [{ topic: 'gardening' }] },
      ]) {
        fetch.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: JSON.stringify(output) } }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      const callApi = vi.spyOn(OpenAiChatCompletionProvider.prototype, 'callApi');
      const tool = vi.fn();
      registerGenerateDatasetTool({ tool } as unknown as McpServer);
      const handler = tool.mock.calls[0][2];

      const result = await handler({
        prompt: 'Discuss {{topic}}',
        provider: `openai:chat:${model}`,
        numSamples: 1,
      });
      const response = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(false);
      expect(response.data.dataset).toEqual([{ vars: { topic: 'gardening' } }]);
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const [url, options] of fetch.mock.calls) {
        expect(String(url)).toBe('https://api.openai.com/v1/chat/completions');
        expect(JSON.parse(options!.body as string).model).toBe(model);
      }
      expect(callApi.mock.contexts[0]).toBeInstanceOf(OpenAiChatCompletionProvider);
    },
  );

  it('rejects a missing model before calling the provider', async () => {
    const create = vi
      .spyOn(Messages.prototype, 'create')
      .mockRejectedValue(new Error('Unexpected Anthropic SDK call'));
    const callApi = vi.spyOn(AnthropicMessagesProvider.prototype, 'callApi');
    const tool = vi.fn();
    registerGenerateDatasetTool({ tool } as unknown as McpServer);
    const handler = tool.mock.calls[0][2];

    const result = await handler({
      prompt: 'Discuss {{topic}}',
      provider: 'anthropic:messages:',
      numSamples: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to load AI provider for dataset generation');
    expect(callApi).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
