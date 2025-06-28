import { z } from 'zod';
import { AbstractTool } from '../../lib';
import type { HealthCheckResult, ToolResult } from '../../lib/types';

/**
 * Health check tool to verify MCP server connectivity and promptfoo system status
 */
export class HealthCheckTool extends AbstractTool {
  readonly name = 'promptfoo_health_check';
  readonly description = 'Check server health and system status';

  protected readonly schema = z.object({});

  protected async execute(): Promise<ToolResult<HealthCheckResult>> {
    const healthData: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    return this.success(healthData);
  }
}
