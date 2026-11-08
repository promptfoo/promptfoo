import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { expect, it, vi } from 'vitest';
import { registerTestProviderTool } from '../../../../src/commands/mcp/tools/testProvider';
import { loadApiProvider } from '../../../../src/providers/index';

vi.mock('../../../../src/providers/index', () => ({ loadApiProvider: vi.fn() }));

it('reports the provider call failure even when looking up its identity would throw', async () => {
  const id = vi.fn(() => {
    throw new Error('provider not found');
  });
  vi.mocked(loadApiProvider).mockResolvedValue({
    id,
    callApi: async () => {
      throw new Error('inference failed');
    },
  });
  const server = new McpServer({ name: 'server', version: '1' });
  registerTestProviderTool(server);
  const client = new Client({ name: 'client', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: 'test_provider',
      arguments: { provider: 'local' },
    });
    expect(result).toMatchObject({
      isError: true,
      content: [
        { type: 'text', text: expect.stringContaining('Provider test failed: inference failed') },
      ],
    });
    expect(id).not.toHaveBeenCalled();
  } finally {
    await client.close();
    await server.close();
  }
});
