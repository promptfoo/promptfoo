import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'deterministic-physics-server',
  version: '1.0.0',
});

// Intentionally permissive: the Python assertion, not the server,
// must decide whether measurement values violate the rules.
const numericInput = z.union([z.number(), z.string(), z.boolean()]).optional();

server.registerTool(
  'validate_measurements',
  {
    title: 'Validate Measurements',
    description: 'Receive physical measurements for deterministic validation.',
    inputSchema: {
      probability: numericInput.describe('Probability value, expected to be between 0 and 1'),
      mass_kg: numericInput.describe('Mass in kilograms, expected to be non-negative'),
      distance_m: numericInput.describe('Distance in metres, expected to be non-negative'),
      duration_s: numericInput.describe('Duration in seconds, expected to be non-negative'),
    },
  },
  async (args) => ({
    content: [
      {
        type: 'text',
        text: `Received measurements: ${JSON.stringify(args)}`,
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Deterministic Physics MCP Server running.');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
