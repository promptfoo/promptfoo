import { spawn } from 'child_process';
import { exec } from 'child_process';
import { Command } from 'commander';
import { checkModelAuditInstalled, modelScanCommand } from '../../src/commands/modelScan';
import logger from '../../src/logger';

jest.mock('child_process', () => ({
  exec: jest.fn(),
  spawn: jest.fn(),
}));

jest.mock('../../src/logger');

describe('modelScan', () => {
  let program: Command;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    program = new Command();
    modelScanCommand(program);
    processExitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit called with "${code}"`);
      });
  });

  afterEach(() => {
    processExitSpy.mockRestore();
  });

  describe('checkModelAuditInstalled', () => {
    it('should return true when modelaudit is installed', async () => {
      const mockExec = jest.mocked(exec);
      mockExec.mockImplementation((_cmd: string, callback?: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      const result = await checkModelAuditInstalled();
      expect(result).toBe(true);
    });

    it('should return false when modelaudit is not installed', async () => {
      const mockExec = jest.mocked(exec);
      mockExec.mockImplementation((_cmd: string, callback?: any) => {
        if (callback) {
          callback(new Error('Command failed'), null);
        }
        return {} as any;
      });

      const result = await checkModelAuditInstalled();
      expect(result).toBe(false);
    });
  });

  describe('modelScanCommand', () => {
    beforeEach(() => {
      const mockExec = jest.mocked(exec);
      mockExec.mockImplementation((_cmd: string, callback?: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      const mockSpawnProcess = {
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'close') {
            handler(0);
          }
          return mockSpawnProcess;
        }),
      };

      jest.mocked(spawn).mockReturnValue(mockSpawnProcess as any);
    });

    it('should error when no paths provided', async () => {
      const scanCmd = program.commands.find((cmd) => cmd.name() === 'scan-model');

      await expect(scanCmd?.parseAsync(['node', 'test'])).rejects.toThrow(
        'process.exit called with "1"',
      );

      expect(logger.error).toHaveBeenCalledWith(
        'No paths specified. Please provide at least one model file or directory to scan.',
      );
    });

    it('should error when modelaudit is not installed', async () => {
      const mockExec = jest.mocked(exec);
      mockExec.mockImplementation((_cmd: string, callback?: any) => {
        if (callback) {
          callback(new Error('Command failed'), null);
        }
        return {} as any;
      });

      const scanCmd = program.commands.find((cmd) => cmd.name() === 'scan-model');

      await expect(scanCmd?.parseAsync(['node', 'test', 'path/to/model'])).rejects.toThrow(
        'process.exit called with "1"',
      );

      expect(logger.error).toHaveBeenCalledWith('ModelAudit is not installed.');
      expect(logger.info).toHaveBeenCalledWith('Please install it using: pip install modelaudit');
    });

    it('should spawn modelaudit process with correct arguments', async () => {
      const scanCmd = program.commands.find((cmd) => cmd.name() === 'scan-model');
      await scanCmd?.parseAsync([
        'node',
        'test',
        'path/to/model',
        '--blacklist',
        'pattern1',
        '--blacklist',
        'pattern2',
        '--format',
        'json',
        '--output',
        'output.json',
        '--timeout',
        '600',
        '--verbose',
        '--max-file-size',
        '1000000',
      ]);

      expect(spawn).toHaveBeenCalledWith(
        'python',
        [
          'modelaudit',
          'path/to/model',
          '--blacklist',
          'pattern1',
          '--blacklist',
          'pattern2',
          '--format',
          'json',
          '--output',
          'output.json',
          '--timeout',
          '600',
          '--verbose',
          '--max-file-size',
          '1000000',
        ],
        { stdio: 'inherit' },
      );
    });

    it('should handle spawn error', async () => {
      const mockSpawnProcess = {
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'error') {
            handler(new Error('Spawn failed'));
          }
          return mockSpawnProcess;
        }),
      };

      jest.mocked(spawn).mockReturnValue(mockSpawnProcess as any);

      const scanCmd = program.commands.find((cmd) => cmd.name() === 'scan-model');

      await expect(scanCmd?.parseAsync(['node', 'test', 'path/to/model'])).rejects.toThrow(
        'process.exit called with "1"',
      );

      expect(logger.error).toHaveBeenCalledWith('Failed to start modelaudit: Spawn failed');
      expect(logger.info).toHaveBeenCalledWith(
        'Make sure modelaudit is installed and available in your PATH.',
      );
    });

    it('should handle non-zero exit code', async () => {
      const mockSpawnProcess = {
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'close') {
            handler(1);
          }
          return mockSpawnProcess;
        }),
      };

      jest.mocked(spawn).mockReturnValue(mockSpawnProcess as any);

      const scanCmd = program.commands.find((cmd) => cmd.name() === 'scan-model');

      await expect(scanCmd?.parseAsync(['node', 'test', 'path/to/model'])).rejects.toThrow(
        'process.exit called with "1"',
      );

      expect(logger.error).toHaveBeenCalledWith('Model scan completed with issues. Exit code: 1');
    });

    it('should handle successful scan completion', async () => {
      const mockSpawnProcess = {
        on: jest.fn().mockImplementation((event, handler) => {
          if (event === 'close') {
            handler(0);
          }
          return mockSpawnProcess;
        }),
      };

      jest.mocked(spawn).mockReturnValue(mockSpawnProcess as any);

      const scanCmd = program.commands.find((cmd) => cmd.name() === 'scan-model');
      await scanCmd?.parseAsync(['node', 'test', 'path/to/model']);

      expect(logger.info).toHaveBeenCalledWith('Model scan completed successfully.');
    });
  });
});
