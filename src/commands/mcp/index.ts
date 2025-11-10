import type { Command } from 'commander';
import logger from '../../logger';
import telemetry from '../../telemetry';
import { startHttpMcpServer, startStdioMcpServer } from './server';
import type { McpCommandOptions } from './types';

export function mcpCommand(program: Command): void {
  program
    .command('mcp')
    .description('Start an MCP server for external tool integrations')
    .option('-p, --port <number>', 'Port number for HTTP transport', '3100')
    .option('--transport <type>', 'Transport type: "http" or "stdio"', 'http')
    .action(async (cmdObj: McpCommandOptions & Command) => {
      // Validate transport type
      if (!['http', 'stdio'].includes(cmdObj.transport)) {
        logger.error(`Invalid transport type: ${cmdObj.transport}. Must be "http" or "stdio".`);
        process.exit(1);
      }

      telemetry.record('command_used', {
        name: 'mcp',
        transport: cmdObj.transport,
      });

      if (cmdObj.transport === 'stdio') {
        await startStdioMcpServer();
      } else {
        const port = Number.parseInt(cmdObj.port, 10);
        if (Number.isNaN(port)) {
          logger.error(`Invalid port number: ${cmdObj.port}`);
          process.exit(1);
        }
        await startHttpMcpServer(port);
      }
    });
}

// Re-export server functions for direct use
export { startHttpMcpServer, startStdioMcpServer, createMcpServer } from './server';
export * from './types';
