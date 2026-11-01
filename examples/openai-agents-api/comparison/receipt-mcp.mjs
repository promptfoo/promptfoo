import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import receiptTools from './receipt-tools.mjs';

const [receipt] = receiptTools;
const server = new McpServer({ name: 'receipt', version: '1.0.0' });
server.registerTool(
  receipt.name,
  {
    description: receipt.description,
    inputSchema: { filename: z.literal('receipt.txt') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => ({ content: [{ type: 'text', text: await receipt.execute() }] }),
);

await server.connect(new StdioServerTransport());
