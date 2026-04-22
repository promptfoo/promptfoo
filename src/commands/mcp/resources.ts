import { loadDefaultConfig } from '../../util/config/default';
import { initializeToolRegistry, toolRegistry } from './lib/toolRegistry';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Initialize the tool registry on module load
initializeToolRegistry();

/**
 * Register MCP resources with the server
 */
export function registerResources(server: McpServer) {
  // Resources with proper namespacing
  server.resource('promptfoo-config', 'promptfoo://config/default', async () => {
    try {
      const { defaultConfig } = await loadDefaultConfig();
      return {
        contents: [
          {
            uri: 'promptfoo://config/default',
            text: JSON.stringify(defaultConfig, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        contents: [
          {
            uri: 'promptfoo://config/default',
            text: JSON.stringify(
              {
                error: `Failed to load default config: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
  });

  server.resource('promptfoo-docs', 'promptfoo://docs/tools', async () => {
    // Auto-generate documentation from the tool registry
    const toolDocs = toolRegistry.generateDocs();

    return {
      contents: [
        {
          uri: 'promptfoo://docs/tools',
          text: JSON.stringify(toolDocs, null, 2),
        },
      ],
    };
  });
}
