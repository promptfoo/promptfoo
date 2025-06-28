import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createToolResponse } from '../utils';

/**
 * Health check tool to verify MCP server connectivity and promptfoo system status
 */
export function registerHealthCheckTool(server: McpServer) {
  server.tool('promptfoo_health_check', {}, async () => {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
    return createToolResponse('promptfoo_health_check', true, healthData);
  });
}
