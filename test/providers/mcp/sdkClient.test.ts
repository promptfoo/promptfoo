import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PaginatedMcpClient } from '../../../src/providers/mcp/sdkClient';
import type { ListToolsResult, Tool } from '@modelcontextprotocol/sdk/types.js';

describe('PaginatedMcpClient', () => {
  let client: PaginatedMcpClient;
  let server: Server;

  beforeEach(async () => {
    server = new Server({ name: 'server', version: '1' }, { capabilities: { tools: {} } });
    client = new PaginatedMcpClient({ name: 'client', version: '1' });
    const [toServer, toClient] = InMemoryTransport.createLinkedPair();
    await server.connect(toClient);
    await client.connect(toServer);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  function tool(name: string): Tool {
    return { name, inputSchema: { type: 'object' } };
  }

  function listPages(page: (cursor: string | undefined) => ListToolsResult) {
    const requested: (string | undefined)[] = [];
    server.setRequestHandler(ListToolsRequestSchema, ({ params }) => {
      requested.push(params?.cursor);
      return page(params?.cursor);
    });
    return requested;
  }

  it('retains output validation and required-task checks for tools from earlier pages', async () => {
    const typed: Tool = { ...tool('typed'), outputSchema: { type: 'object' } };
    const tasked: Tool = { ...tool('tasked'), execution: { taskSupport: 'required' } };
    const plain = tool('plain');
    const requested = listPages((cursor) =>
      cursor === undefined ? { tools: [typed, tasked], nextCursor: '' } : { tools: [plain] },
    );
    const called: string[] = [];
    server.setRequestHandler(CallToolRequestSchema, ({ params }) => {
      called.push(params.name);
      return { content: [] };
    });

    expect(await client.listTools()).toEqual({ tools: [typed, tasked, plain] });
    expect(requested).toEqual([undefined, '']);
    await expect(client.callTool({ name: 'typed' })).rejects.toThrow(
      /did not return structured content/,
    );
    await expect(client.callTool({ name: 'tasked' })).rejects.toThrow(
      /requires task-based execution/,
    );
    await expect(client.callTool({ name: 'plain' })).resolves.toEqual({ content: [] });
    expect(called).toEqual(['typed', 'plain']);
  });

  it('stops when the server repeats a cursor', async () => {
    const requested = listPages(() => ({ tools: [], nextCursor: 'same' }));
    await expect(client.listTools()).rejects.toThrow('repeated tools/list pagination cursor');
    expect(requested).toEqual([undefined, 'same']);
  });

  it('propagates cancellation during a later page request', async () => {
    const controller = new AbortController();
    const requested = listPages((cursor) => {
      if (cursor === undefined) {
        return { tools: [], nextCursor: 'second' };
      }
      controller.abort(new Error('stop discovery'));
      return { tools: [] };
    });

    await expect(client.listTools(undefined, { signal: controller.signal })).rejects.toThrow(
      'stop discovery',
    );
    expect(requested).toEqual([undefined, 'second']);
  });

  it('returns a single page when the caller supplies a cursor', async () => {
    const requested = listPages(() => ({ tools: [], nextCursor: 'next' }));
    await expect(client.listTools({ cursor: '' })).resolves.toEqual({
      tools: [],
      nextCursor: 'next',
    });
    expect(requested).toEqual(['']);
  });

  function numberedPages(total: number) {
    return listPages((cursor) => {
      const page = Number(cursor ?? 1);
      return {
        tools: [tool(String(page))],
        nextCursor: page < total ? String(page + 1) : undefined,
      };
    });
  }

  it('accepts a catalog ending on page 100', async () => {
    const requested = numberedPages(100);
    const result = await client.listTools();
    expect(result.tools).toHaveLength(100);
    expect(result.tools.at(-1)?.name).toBe('100');
    expect(requested).toHaveLength(100);
    expect(result.nextCursor).toBeUndefined();
  });

  it('stops before requesting page 101 even when every cursor is distinct', async () => {
    const requested = numberedPages(101);
    await expect(client.listTools()).rejects.toThrow('limit of 100 pages');
    expect(requested).toHaveLength(100);
  });

  it('limits the total number of tools across pages', async () => {
    const requested = listPages((cursor) => ({
      tools: Array.from({ length: 5_001 }, (_, i) => tool(`tool-${cursor ?? 'first'}-${i}`)),
      nextCursor: cursor === undefined ? 'second' : undefined,
    }));
    await expect(client.listTools()).rejects.toThrow('limit of 10000 tools');
    expect(requested).toEqual([undefined, 'second']);
  });

  it('limits the cumulative UTF-8 size of tool descriptions across pages', async () => {
    const description = 'é'.repeat(4 * 1024 * 1024);
    const requested = listPages((cursor) => ({
      tools: [{ ...tool(cursor ?? 'first'), description }],
      nextCursor: cursor === undefined ? 'second' : undefined,
    }));
    await expect(client.listTools()).rejects.toThrow('limit of 16777216 bytes');
    expect(requested).toEqual([undefined, 'second']);
  });
});
