import type { Command } from 'commander';
import { upgradeCommand } from '../../src/commands/upgrade';
import * as updates from '../../src/updates';
import * as util from '../../src/util';
import { execAsync } from '../../src/python/execAsync';
import logger from '../../src/logger';
import { VERSION } from '../../src/constants';
import telemetry from '../../src/telemetry';

jest.mock('child_process', () => ({
  execSync: jest.fn(),
  exec: jest.fn(),
}));
jest.mock('../../src/python/execAsync', () => ({
  execAsync: jest.fn(),
}));
jest.mock('../../src/updates');
jest.mock('../../src/util');
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));
jest.mock('../../src/telemetry', () => {
  return {
    __esModule: true,
    default: {
      record: jest.fn(),
    },
  };
});

const mockedExecAsync = jest.mocked(execAsync);
const mockedGetLatestVersion = jest.mocked(updates.getLatestVersion);
const mockedIsRunningUnderNpx = jest.mocked(util.isRunningUnderNpx);
const mockedTelemetry = jest.mocked(telemetry);
const { execSync } = require('child_process');

describe('upgrade command', () => {
  let program: Command;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let mockCommand: any;
  let mockAction: jest.Mock;

  beforeEach(() => {
    mockAction = jest.fn();
    mockCommand = {
      description: jest.fn().mockReturnThis(),
      option: jest.fn().mockReturnThis(),
      action: mockAction,
    };
    
    program = {
      command: jest.fn().mockReturnValue(mockCommand),
    } as unknown as Command;

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  it('should register the upgrade command', () => {
    upgradeCommand(program);

    expect(program.command).toHaveBeenCalledWith('upgrade');
    expect(mockCommand.description).toHaveBeenCalledWith('Upgrade promptfoo to the latest version or a specific version');
    expect(mockCommand.option).toHaveBeenCalledWith('--version <version>', 'Upgrade to a specific version');
    expect(mockCommand.option).toHaveBeenCalledWith('--check', 'Check for updates without upgrading');
    expect(mockCommand.option).toHaveBeenCalledWith('--force', 'Force upgrade even if already on the target version');
    expect(mockCommand.option).toHaveBeenCalledWith('--dry-run', 'Show what would be done without actually upgrading');
  });

  describe('installation detection', () => {
    it('should detect npx installation', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ check: true });

      expect(mockedIsRunningUnderNpx).toHaveBeenCalled();
    });

    it('should detect npm global installation', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
        stderr: '',
      });
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      mockedGetLatestVersion.mockResolvedValue('1.0.0');
      await action({ check: true });

      expect(mockedExecAsync).toHaveBeenCalledWith('npm list -g promptfoo --json');
    });

    it('should detect yarn global installation', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync
        .mockRejectedValueOnce(new Error('npm not found'))
        .mockResolvedValueOnce({
          stdout: 'promptfoo@1.0.0',
          stderr: '',
        });
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      mockedGetLatestVersion.mockResolvedValue('1.0.0');
      await action({ check: true });

      expect(mockedExecAsync).toHaveBeenCalledWith('yarn global list --json');
    });

    it('should detect pnpm global installation', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync
        .mockRejectedValueOnce(new Error('npm not found'))
        .mockRejectedValueOnce(new Error('yarn not found'))
        .mockResolvedValueOnce({
          stdout: JSON.stringify([{ dependencies: { promptfoo: { version: '1.0.0' } } }]),
          stderr: '',
        });
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      mockedGetLatestVersion.mockResolvedValue('1.0.0');
      await action({ check: true });

      expect(mockedExecAsync).toHaveBeenCalledWith('pnpm list -g --json');
    });
  });

  describe('check for updates', () => {
    it('should show update available message', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
        stderr: '',
      });
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ check: true });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('should show up-to-date message', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ dependencies: { promptfoo: { version: VERSION } } }),
        stderr: '',
      });
      mockedGetLatestVersion.mockResolvedValue(VERSION);
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ check: true });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('You are on the latest version'));
    });
  });

  describe('upgrade functionality', () => {
    it('should upgrade npm global installation', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: '2.0.0',
          stderr: '',
        });
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      execSync.mockImplementation(() => {});
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(execSync).toHaveBeenCalledWith('npm install -g promptfoo@latest', { stdio: 'inherit' });
    });

    it('should upgrade to specific version', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: '1.5.0',
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: '1.5.0',
          stderr: '',
        });
      execSync.mockImplementation(() => {});
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ version: '1.5.0' });

      expect(execSync).toHaveBeenCalledWith('npm install -g promptfoo@1.5.0', { stdio: 'inherit' });
    });

    it('should handle dry-run mode', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
        stderr: '',
      });
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ dryRun: true });

      expect(execSync).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Dry run mode'));
    });

    it('should handle npx with special message', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('running promptfoo via npx'));
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should force reinstall when --force is used', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ dependencies: { promptfoo: { version: VERSION } } }),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: VERSION,
          stderr: '',
        });
      mockedGetLatestVersion.mockResolvedValue(VERSION);
      execSync.mockImplementation(() => {});
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ force: true });

      expect(execSync).toHaveBeenCalledWith(`npm install -g promptfoo@latest`, { stdio: 'inherit' });
    });

    it('should handle upgrade errors gracefully', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
        stderr: '',
      });
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      execSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to upgrade'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('error handling', () => {
    it('should handle version not found error', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
          stderr: '',
        })
        .mockRejectedValueOnce(new Error('Not found'));
      
      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ version: '99.99.99' });

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Upgrade failed'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle binary installation error', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockRejectedValue(new Error('Not found'));
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      
      Object.defineProperty(process, 'argv', {
        value: ['/usr/local/bin/node', '/usr/local/bin/promptfoo'],
        writable: true,
      });

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Binary installations cannot be upgraded automatically'));
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });
});