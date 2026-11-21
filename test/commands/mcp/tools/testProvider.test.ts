import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, expect, it, vi } from 'vitest';
import { registerTestProviderTool } from '../../../../src/commands/mcp/tools/testProvider';
import { loadApiProvider } from '../../../../src/providers/index';

vi.mock('../../../../src/providers/index', () => ({ loadApiProvider: vi.fn() }));

afterEach(() => void vi.mocked(loadApiProvider).mockReset());

it('reports the call error and recovers on the next provider test', async () => {
  const id = vi.fn(() => {
    throw new Error('provider not found');
  });
  const callApi = vi.fn().mockRejectedValueOnce(new Error('inference failed'));
  vi.mocked(loadApiProvider)
    .mockResolvedValueOnce({ id, callApi })
    .mockResolvedValueOnce({ id: () => 'local', callApi: async () => ({ output: 'recovered' }) });
  const server = new McpServer({ name: 'server', version: '1' });
  registerTestProviderTool(server);
  const client = new Client({ name: 'client', version: '1' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const call = () => client.callTool({ name: 'test_provider', arguments: { provider: 'local' } });
    expect(await call()).toMatchObject({
      isError: true,
      content: [
        { type: 'text', text: expect.stringContaining('Provider test failed: inference failed') },
      ],
    });
    expect(id).not.toHaveBeenCalled();
    const success = await call();
    expect(success).toMatchObject({ isError: false, content: [{ type: 'text' }] });
    const [content] = success.content as { text: string }[];
    expect(JSON.parse(content.text)).toMatchObject({
      success: true,
      data: { providerId: 'local', response: 'recovered' },
    });
  } finally {
    await client.close();
    await server.close();
  }
});
