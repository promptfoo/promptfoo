import { isDeepStrictEqual } from 'node:util';

import logger from '../../logger';
import { MCPProvider } from '../../providers/mcp/index';

import type { MCPTool } from '../../providers/mcp/types';
import type { ApiProvider } from '../../types/index';

export async function extractMcpTools(providers: ApiProvider[]): Promise<MCPTool[]> {
  const tools = new Map<string, { tool: MCPTool; providerId: string }>();

  for (const provider of providers) {
    if (!(provider instanceof MCPProvider)) {
      continue;
    }
    let availableTools: MCPTool[];
    try {
      availableTools = await provider.getAvailableTools();
    } catch (error) {
      logger.warn(
        `Failed to get tools from MCP provider: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    for (const tool of availableTools) {
      const existing = tools.get(tool.name);
      if (existing && !isDeepStrictEqual(existing.tool.inputSchema, tool.inputSchema)) {
        throw new Error(
          `MCP tool "${tool.name}" has conflicting input schemas in providers "${existing.providerId}" and "${provider.id()}". Run separate redteams for these targets or use distinct tool names.`,
        );
      }
      if (!existing) {
        tools.set(tool.name, { tool, providerId: provider.id() });
      }
    }
  }

  return [...tools.values()].map(({ tool }) => tool);
}

export async function extractMcpToolsInfo(providers: ApiProvider[]): Promise<string> {
  const tools = await extractMcpTools(providers);
  return tools.length
    ? '\nAvailable MCP tools:\n' + tools.map((tool) => JSON.stringify(tool)).join('\n')
    : '';
}
