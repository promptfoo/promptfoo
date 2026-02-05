import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockReadLastLines = vi.fn();
const mockReadFirstLines = vi.fn();

vi.mock('../../../../src/util/logs', () => ({
  getLogDirectory: vi.fn().mockReturnValue('/mock/logs'),
  getLogFiles: vi.fn(),
  formatFileSize: vi.fn((bytes: number) => {
    if (bytes === 0) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
  }),
  readLastLines: (...args: unknown[]) => mockReadLastLines(...args),
  readFirstLines: (...args: unknown[]) => mockReadFirstLines(...args),
}));

vi.mock('fs/promises', () => ({
  default: {
    stat: vi.fn(),
  },
}));

// Import mocked modules
import fs from 'fs/promises';

import { getLogFiles } from '../../../../src/util/logs';

describe('logs MCP tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('list_logs tool', () => {
    it('should list log files with pagination', async () => {
      const mockLogFiles = [
        {
          name: 'promptfoo-debug-2024-01-15_10-30-00.log',
          path: '/mock/logs/promptfoo-debug-2024-01-15_10-30-00.log',
          type: 'debug' as const,
          size: 1024,
          mtime: new Date('2024-01-15T10:30:00Z'),
        },
        {
          name: 'promptfoo-error-2024-01-15_10-30-00.log',
          path: '/mock/logs/promptfoo-error-2024-01-15_10-30-00.log',
          type: 'error' as const,
          size: 512,
          mtime: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      vi.mocked(getLogFiles).mockResolvedValue(mockLogFiles);

      // Import tool after mocks are set up
      const { registerListLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      // Create a mock server to capture the registered tool
      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerListLogsTool(mockServer as any);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'list_logs',
        expect.any(Object),
        expect.any(Function),
      );

      // Execute the handler
      const result = await registeredHandler!({ type: 'all', page: 1, pageSize: 20 });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.logs).toHaveLength(2);
      expect(response.data.summary.totalFiles).toBe(2);
      expect(response.data.summary.debugFiles).toBe(1);
      expect(response.data.summary.errorFiles).toBe(1);
    });

    it('should return empty result when no log files exist', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([]);

      const { registerListLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerListLogsTool(mockServer as any);

      const result = await registeredHandler!({ type: 'all' });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.logs).toHaveLength(0);
      expect(response.data.summary.message).toContain('No log files found');
    });

    it('should filter by log type', async () => {
      const mockLogFiles = [
        {
          name: 'promptfoo-debug-2024-01-15_10-30-00.log',
          path: '/mock/logs/promptfoo-debug-2024-01-15_10-30-00.log',
          type: 'debug' as const,
          size: 1024,
          mtime: new Date('2024-01-15T10:30:00Z'),
        },
      ];

      vi.mocked(getLogFiles).mockResolvedValue(mockLogFiles);

      const { registerListLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerListLogsTool(mockServer as any);

      const result = await registeredHandler!({ type: 'debug' });

      expect(getLogFiles).toHaveBeenCalledWith('debug');
      expect(result.isError).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(getLogFiles).mockRejectedValue(new Error('Permission denied'));

      const { registerListLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerListLogsTool(mockServer as any);

      const result = await registeredHandler!({ type: 'all' });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('Permission denied');
    });
  });

  describe('read_logs tool', () => {
    const mockLogFile = {
      name: 'promptfoo-debug-2024-01-15_10-30-00.log',
      path: '/mock/logs/promptfoo-debug-2024-01-15_10-30-00.log',
      type: 'debug' as const,
      size: 1024,
      mtime: new Date('2024-01-15T10:30:00Z'),
    };

    it('should read latest log file by default', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([mockLogFile]);
      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      // Mock readLastLines to return log lines
      const mockLines = ['2024-01-15 [INFO] Test log line 1', '2024-01-15 [ERROR] Test error'];
      mockReadLastLines.mockResolvedValue(mockLines);

      const { registerReadLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerReadLogsTool(mockServer as any);

      const result = await registeredHandler!({});

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.file.name).toBe(mockLogFile.name);
      expect(response.data.content).toContain('Test log line 1');
      expect(response.data.metadata.readMode).toBe('tail');
    });

    it('should find log file by partial name', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([mockLogFile]);
      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      mockReadLastLines.mockResolvedValue(['Test line']);

      const { registerReadLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerReadLogsTool(mockServer as any);

      const result = await registeredHandler!({ file: 'debug-2024-01-15' });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
    });

    it('should return error when file not found', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([mockLogFile]);

      const { registerReadLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerReadLogsTool(mockServer as any);

      const result = await registeredHandler!({ file: 'nonexistent-file.log' });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should return error when no logs exist for type', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([]);

      const { registerReadLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerReadLogsTool(mockServer as any);

      const result = await registeredHandler!({ type: 'error' });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('No error log files found');
    });

    it('should read from head when specified', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([mockLogFile]);
      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      mockReadFirstLines.mockResolvedValue(['First line', 'Second line']);

      const { registerReadLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerReadLogsTool(mockServer as any);

      const result = await registeredHandler!({ head: true, lines: 2 });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.data.metadata.readMode).toBe('head');
    });

    it('should filter content with grep pattern', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([mockLogFile]);
      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      const mockLines = [
        '2024-01-15 [INFO] Normal message',
        '2024-01-15 [ERROR] Error occurred',
        '2024-01-15 [INFO] Another normal message',
        '2024-01-15 [ERROR] Another error',
      ];
      mockReadLastLines.mockResolvedValue(mockLines);

      const { registerReadLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerReadLogsTool(mockServer as any);

      const result = await registeredHandler!({ grep: 'ERROR' });

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.data.content).toContain('ERROR');
      expect(response.data.content).not.toContain('Normal message');
      expect(response.data.metadata.grepPattern).toBe('ERROR');
    });

    it('should handle invalid grep pattern gracefully', async () => {
      vi.mocked(getLogFiles).mockResolvedValue([mockLogFile]);
      vi.mocked(fs.stat).mockResolvedValue({ isFile: () => true } as any);

      const mockLines = ['Test [ERROR] line', 'Test [INFO] line'];
      mockReadLastLines.mockResolvedValue(mockLines);

      const { registerReadLogsTool } = await import('../../../../src/commands/mcp/tools/logs');

      let registeredHandler: ((args: any) => Promise<any>) | null = null;
      const mockServer = {
        tool: vi.fn((_name: string, _schema: any, handler: (args: any) => Promise<any>) => {
          registeredHandler = handler;
        }),
      };

      registerReadLogsTool(mockServer as any);

      // Invalid regex should fall back to substring match
      const result = await registeredHandler!({ grep: '[ERROR' }); // Invalid regex

      expect(result.isError).toBe(false);
      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      // Should still match using substring
      expect(response.data.content).toContain('[ERROR]');
    });
  });

  describe('registerLogTools', () => {
    it('should register both list_logs and read_logs tools', async () => {
      const { registerLogTools } = await import('../../../../src/commands/mcp/tools/logs');

      const registeredTools: string[] = [];
      const mockServer = {
        tool: vi.fn((name: string) => {
          registeredTools.push(name);
        }),
      };

      registerLogTools(mockServer as any);

      expect(registeredTools).toContain('list_logs');
      expect(registeredTools).toContain('read_logs');
      expect(mockServer.tool).toHaveBeenCalledTimes(2);
    });
  });
});
