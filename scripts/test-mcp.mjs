import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'test-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Try the simple approach
try {
  server.setRequestHandler('tools/list', async () => {
    return { tools: [] };
  });
  console.log('SUCCESS: setRequestHandler worked with string');
} catch (e) {
  console.log('ERROR with string:', e.message);
}

// Check available methods
console.log('Server methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(server)));

// Actually connect and see what happens
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Test MCP Server running...');
