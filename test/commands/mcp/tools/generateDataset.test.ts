import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerGenerateDatasetTool } from '../../../../src/commands/mcp/tools/generateDataset';
import { AnthropicMessagesProvider } from '../../../../src/providers/anthropic/messages';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

describe('generateDataset tool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates a dataset with the advertised Anthropic selector through the real loader', async () => {
    const callApi = vi
      .spyOn(AnthropicMessagesProvider.prototype, 'callApi')
      .mockResolvedValueOnce({ output: JSON.stringify({ personas: ['A curious reader'] }) })
      .mockResolvedValueOnce({ output: JSON.stringify({ vars: [{ topic: 'gardening' }] }) });
    const tool = vi.fn();
    registerGenerateDatasetTool({ tool } as unknown as McpServer);
    const [, schema, handler] = tool.mock.calls[0];
    const provider = schema.provider.description.match(/"(anthropic:[^"]+)"/)[1];

    const result = await handler({ prompt: 'Discuss {{topic}}', provider, numSamples: 1 });
    const response = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(false);
    expect(response.success).toBe(true);
    expect(response.data.dataset).toEqual([{ vars: { topic: 'gardening' } }]);
    expect(callApi).toHaveBeenCalledTimes(2);
    const actualProvider = callApi.mock.contexts[0] as AnthropicMessagesProvider;
    expect(actualProvider).toBeInstanceOf(AnthropicMessagesProvider);
    expect(actualProvider.id()).toBe('anthropic:claude-sonnet-4-6');
    expect(actualProvider.modelName).toBe('claude-sonnet-4-6');
  });

  it('rejects an invalid selector before calling the provider', async () => {
    const callApi = vi
      .spyOn(AnthropicMessagesProvider.prototype, 'callApi')
      .mockRejectedValue(new Error('Invalid selectors must not call a provider'));
    const tool = vi.fn();
    registerGenerateDatasetTool({ tool } as unknown as McpServer);
    const handler = tool.mock.calls[0][2];

    const result = await handler({
      prompt: 'Discuss {{topic}}',
      provider: 'anthropic:messages:claude-sonnet-4-6',
      numSamples: 1,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to load AI provider for dataset generation');
    expect(callApi).not.toHaveBeenCalled();
  });
});
