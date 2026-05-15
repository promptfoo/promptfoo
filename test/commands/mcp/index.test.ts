import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mcpCommand } from '../../../src/commands/mcp/index';
import { startHttpMcpServer } from '../../../src/commands/mcp/server';
import logger from '../../../src/logger';

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

vi.mock('../../../src/commands/mcp/server', () => ({
  startHttpMcpServer: vi.fn(),
  startStdioMcpServer: vi.fn(),
  createMcpServer: vi.fn(),
}));

describe('mcp command', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    program = new Command();
    mcpCommand(program);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('validation', () => {
    it('should set exitCode=1 for invalid transport type', async () => {
      const mcpCmd = program.commands.find((cmd) => cmd.name() === 'mcp');
      expect(mcpCmd).toBeDefined();
      await mcpCmd!.parseAsync(['node', 'test', '--transport', 'invalid']);

      expect(logger.error).toHaveBeenCalledWith(
        'Invalid transport type: invalid. Must be "http" or "stdio".',
      );
      expect(process.exitCode).toBe(1);
    });

    it('should set exitCode=1 for invalid port number', async () => {
      const mcpCmd = program.commands.find((cmd) => cmd.name() === 'mcp');
      expect(mcpCmd).toBeDefined();
      await mcpCmd!.parseAsync(['node', 'test', '--port', 'not-a-number']);

      expect(logger.error).toHaveBeenCalledWith('Invalid port number: not-a-number');
      expect(process.exitCode).toBe(1);
    });
  });

  describe('http transport', () => {
    it('should pass port and host to the HTTP MCP server', async () => {
      const mcpCmd = program.commands.find((cmd) => cmd.name() === 'mcp');
      expect(mcpCmd).toBeDefined();

      await mcpCmd!.parseAsync([
        'node',
        'test',
        '--transport',
        'http',
        '--port',
        '8080',
        '--host',
        '0.0.0.0',
      ]);

      expect(startHttpMcpServer).toHaveBeenCalledWith(8080, '0.0.0.0');
    });

    it('should fall back to the server default when host is blank', async () => {
      const mcpCmd = program.commands.find((cmd) => cmd.name() === 'mcp');
      expect(mcpCmd).toBeDefined();

      await mcpCmd!.parseAsync(['node', 'test', '--transport', 'http', '--host', '']);

      expect(startHttpMcpServer).toHaveBeenCalledWith(3100, undefined);
    });
  });
});
