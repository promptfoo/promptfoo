import logger from '../../logger';
import { MCPProvider } from '../../providers/mcp/index';
import { getProviderPath } from './providerPath';

import type { ApiProvider } from '../../types/index';

/**
 * Helper function to check if a provider path indicates an MCP provider
 */
function isMcpProviderPath(providerPath: string): boolean {
  return providerPath === 'mcp' || providerPath.startsWith('mcp:');
}

/**
 * Extract tools information from MCP providers and format for red team purpose
 */
export async function extractMcpToolsInfo(providers: ApiProvider[]): Promise<string> {
  const mcpProviders: MCPProvider[] = [];

  // Find MCP providers
  for (const provider of providers) {
    const providerPath = getProviderPath(provider);
    if (providerPath && isMcpProviderPath(providerPath) && provider instanceof MCPProvider) {
      mcpProviders.push(provider);
    }
  }

  if (mcpProviders.length === 0) {
    return '';
  }

  const toolsInfo: string[] = [];

  for (const mcpProvider of mcpProviders) {
    try {
      // Wait a moment for MCP provider initialization to complete
      // The MCPProvider initializes automatically in the constructor
      await mcpProvider;

      const tools = await mcpProvider.getAvailableTools();

      if (tools.length > 0) {
        toolsInfo.push('\nAvailable MCP tools:');

        for (const tool of tools) {
          toolsInfo.push(JSON.stringify(tool));
        }
      }
    } catch (error) {
      logger.warn(
        `Failed to get tools from MCP provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return toolsInfo.join('\n');
}
