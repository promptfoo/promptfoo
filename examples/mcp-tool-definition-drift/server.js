import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const tool = {
  name: 'get_weather',
  // Change only this description to try the precheck.
  description: 'Get the current weather for a city.',
  inputSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
    additionalProperties: false,
  },
};

const server = new Server(
  { name: 'tool-definition-example', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [tool] }));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  if (params.name !== tool.name || typeof params.arguments?.city !== 'string') {
    throw new Error('Expected get_weather with a city string');
  }
  return { content: [{ type: 'text', text: `${params.arguments.city}: sunny, 20 C` }] };
});

await server.connect(new StdioServerTransport());
