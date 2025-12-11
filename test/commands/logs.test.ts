import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import { Command } from 'commander';

import { logsCommand } from '../../src/commands/logs';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import * as logsUtil from '../../src/util/logs';

vi.mock('fs');
vi.mock('../../src/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));
vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
    send: vi.fn(),
  },
}));
vi.mock('../../src/cliState', () => ({
  default: {
    debugLogFile: undefined,
    errorLogFile: undefined,
  },
}));
vi.mock('../../src/util/logs', () => ({
  getLogDirectory: vi.fn().mockReturnValue('/home/user/.promptfoo/logs'),
  getLogFiles: vi.fn().mockReturnValue([]),
  findLogFile: vi.fn().mockReturnValue(null),
  formatFileSize: vi.fn((bytes: number) => `${bytes} B`),
}));
vi.mock('../../src/util/index', () => ({
  printBorder: vi.fn(),
}));
vi.mock('../../src/table', () => ({
  wrapTable: vi.fn().mockReturnValue('mocked table'),
}));

describe('logs command', () => {
  let program: Command;
  const mockFs = vi.mocked(fs);
  const mockLogsUtil = vi.mocked(logsUtil);
  const mockCliState = vi.mocked(cliState);

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
    logsCommand(program);
    process.exitCode = 0;

    // Reset cliState
    mockCliState.debugLogFile = undefined;
    mockCliState.errorLogFile = undefined;
  });

  afterEach(() => {
    vi.resetAllMocks();
    process.exitCode = 0;
  });

  describe('command registration', () => {
    it('should register logs command with correct options', () => {
      const cmd = program.commands.find((c) => c.name() === 'logs');

      expect(cmd).toBeDefined();
      expect(cmd?.description()).toContain('View promptfoo log files');

      const options = cmd?.options;
      expect(options?.find((o) => o.long === '--type')).toBeDefined();
      expect(options?.find((o) => o.long === '--lines')).toBeDefined();
      expect(options?.find((o) => o.long === '--head')).toBeDefined();
      expect(options?.find((o) => o.long === '--follow')).toBeDefined();
      expect(options?.find((o) => o.long === '--list')).toBeDefined();
      expect(options?.find((o) => o.long === '--grep')).toBeDefined();
      expect(options?.find((o) => o.long === '--no-color')).toBeDefined();
    });

    it('should register list subcommand', () => {
      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      const listCmd = logsCmd?.commands.find((c) => c.name() === 'list');

      expect(listCmd).toBeDefined();
      expect(listCmd?.description()).toContain('List available log files');
    });
  });

  describe('--list option', () => {
    it('should display message when no log files found', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('debug');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('No log files found'));
    });

    it('should display table when log files exist', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([
        {
          name: 'promptfoo-debug-2024-01-01_10-00-00.log',
          path: '/home/user/.promptfoo/logs/promptfoo-debug-2024-01-01_10-00-00.log',
          mtime: new Date('2024-01-01T10:00:00Z'),
          type: 'debug',
          size: 1024,
        },
      ]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list']);

      // wrapTable is called and result is logged
      expect(logger.info).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo logs <filename>'),
      );
    });

    it('should filter by type when specified', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list', '--type', 'error']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('error');
    });

    it('should use all log types when --type all is specified', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--list', '--type', 'all']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('all');
    });
  });

  describe('viewing log files', () => {
    const mockLogPath = '/home/user/.promptfoo/logs/promptfoo-debug-2024-01-01_10-00-00.log';
    const mockLogContent = `2024-01-01T10:00:00.000Z [INFO]: Test message 1
2024-01-01T10:00:01.000Z [DEBUG]: Test debug message
2024-01-01T10:00:02.000Z [ERROR]: Test error message
2024-01-01T10:00:03.000Z [WARN]: Test warning message`;

    beforeEach(() => {
      mockLogsUtil.findLogFile.mockReturnValue(null);
      mockLogsUtil.getLogFiles.mockReturnValue([
        {
          name: 'promptfoo-debug-2024-01-01_10-00-00.log',
          path: mockLogPath,
          mtime: new Date('2024-01-01T10:00:00Z'),
          type: 'debug',
          size: mockLogContent.length,
        },
      ]);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        size: mockLogContent.length,
        mtime: new Date('2024-01-01T10:00:00Z'),
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(mockLogContent);
      mockFs.accessSync.mockReturnValue(undefined);
    });

    it('should show error when no log files available', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('No log files found'));
      expect(process.exitCode).toBe(1);
    });

    it('should show error when specified file not found', async () => {
      mockLogsUtil.findLogFile.mockReturnValue(null);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', 'nonexistent.log']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Log file not found'));
      expect(process.exitCode).toBe(1);
    });

    it('should display most recent log file by default', async () => {
      mockFs.existsSync.mockReturnValue(true);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('promptfoo-debug'));
      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockLogPath, 'utf-8');
    });

    it('should use current session log file when available', async () => {
      const sessionLogPath = '/session/log/path.log';
      mockCliState.debugLogFile = sessionLogPath;
      mockFs.existsSync.mockImplementation((p) => p === sessionLogPath);
      mockFs.statSync.mockReturnValue({
        size: mockLogContent.length,
        mtime: new Date(),
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(mockLogContent);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(mockFs.readFileSync).toHaveBeenCalledWith(sessionLogPath, 'utf-8');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('current CLI session'));
    });

    it('should display specific file when provided', async () => {
      mockLogsUtil.findLogFile.mockReturnValue(mockLogPath);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', 'promptfoo-debug-2024-01-01_10-00-00.log']);

      expect(mockLogsUtil.findLogFile).toHaveBeenCalledWith(
        'promptfoo-debug-2024-01-01_10-00-00.log',
        'debug',
      );
      expect(mockFs.readFileSync).toHaveBeenCalledWith(mockLogPath, 'utf-8');
    });

    it('should limit output with --lines option', async () => {
      mockLogsUtil.findLogFile.mockReturnValue(mockLogPath);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '-n', '2']);

      expect(mockFs.readFileSync).toHaveBeenCalled();
      // The command reads the file and slices lines internally
    });

    it('should limit output with --head option', async () => {
      mockLogsUtil.findLogFile.mockReturnValue(mockLogPath);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--head', '2']);

      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('should handle permission errors', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([
        {
          name: 'test.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: 100,
        },
      ]);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.accessSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Permission denied'));
      expect(process.exitCode).toBe(1);
    });

    it('should handle empty log files', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([
        {
          name: 'empty.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: 0,
        },
      ]);
      mockFs.statSync.mockReturnValue({
        size: 0,
        mtime: new Date(),
      } as fs.Stats);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Log file is empty'));
    });

    it('should warn about large files', async () => {
      const largeSize = 2 * 1024 * 1024; // 2MB
      mockLogsUtil.getLogFiles.mockReturnValue([
        {
          name: 'large.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: largeSize,
        },
      ]);
      mockFs.statSync.mockReturnValue({
        size: largeSize,
        mtime: new Date(),
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue('a'.repeat(largeSize));

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('large'));
    });

    it('should filter output with --grep option', async () => {
      const logContentWithErrors = `2024-01-01T10:00:00.000Z [INFO]: Starting application
2024-01-01T10:00:01.000Z [ERROR]: Connection failed
2024-01-01T10:00:02.000Z [INFO]: Retrying connection
2024-01-01T10:00:03.000Z [ERROR]: Connection timeout`;

      mockLogsUtil.getLogFiles.mockReturnValue([
        {
          name: 'test.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: logContentWithErrors.length,
        },
      ]);
      mockFs.statSync.mockReturnValue({
        size: logContentWithErrors.length,
        mtime: new Date(),
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(logContentWithErrors);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--grep', 'ERROR']);

      // Should have logged content containing ERROR lines
      expect(logger.info).toHaveBeenCalled();
      const calls = vi.mocked(logger.info).mock.calls;
      const outputCall = calls.find((call) => String(call[0]).includes('Connection'));
      expect(outputCall).toBeDefined();
    });

    it('should show message when grep finds no matches', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([
        {
          name: 'test.log',
          path: mockLogPath,
          mtime: new Date(),
          type: 'debug',
          size: mockLogContent.length,
        },
      ]);
      mockFs.statSync.mockReturnValue({
        size: mockLogContent.length,
        mtime: new Date(),
      } as fs.Stats);
      mockFs.readFileSync.mockReturnValue(mockLogContent);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test', '--grep', 'NONEXISTENT_PATTERN']);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No lines matching "NONEXISTENT_PATTERN" found'),
      );
    });
  });

  describe('list subcommand', () => {
    it('should list all log types by default', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      const listCmd = logsCmd?.commands.find((c) => c.name() === 'list');
      await listCmd?.parseAsync(['node', 'test']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('all');
    });

    it('should filter by type when specified', async () => {
      mockLogsUtil.getLogFiles.mockReturnValue([]);

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      const listCmd = logsCmd?.commands.find((c) => c.name() === 'list');
      await listCmd?.parseAsync(['node', 'test', '--type', 'error']);

      expect(mockLogsUtil.getLogFiles).toHaveBeenCalledWith('error');
    });
  });

  describe('error handling', () => {
    it('should handle general errors gracefully', async () => {
      mockLogsUtil.getLogFiles.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const logsCmd = program.commands.find((c) => c.name() === 'logs');
      await logsCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to read logs'));
      expect(process.exitCode).toBe(1);
    });
  });
});
