import logger from '../../logger';
import { MCPProvider } from '../../providers/mcp/index';

import type { MCPTool } from '../../providers/mcp/types';
import type { ApiProvider } from '../../types/index';

export async function extractMcpTools(providers: ApiProvider[]): Promise<MCPTool[]> {
  const tools: MCPTool[] = [];

  for (const provider of providers) {
    if (!(provider instanceof MCPProvider)) {
      continue;
    }
    try {
      tools.push(...(await provider.getAvailableTools()));
    } catch (error) {
      logger.warn(
        `Failed to get tools from MCP provider: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return tools;
}

export async function extractMcpToolsInfo(providers: ApiProvider[]): Promise<string> {
  const tools = await extractMcpTools(providers);
  return tools.length
    ? '\nAvailable MCP tools:\n' + tools.map((tool) => JSON.stringify(tool)).join('\n')
    : '';
}
