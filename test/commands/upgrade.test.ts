import { execSync } from 'child_process';
import type { Command } from 'commander';
import { upgradeCommand } from '../../src/commands/upgrade';
import { VERSION } from '../../src/constants';
import logger from '../../src/logger';
import { execAsync } from '../../src/python/execAsync';
import telemetry from '../../src/telemetry';
import * as updates from '../../src/updates';
import * as util from '../../src/util';

jest.mock('child_process');
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
const mockedExecSync = jest.mocked(execSync);

describe('upgrade command', () => {
  let program: Command;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let mockCommand: any;
  let mockAction: jest.Mock;
  let originalExecPath: string;
  let originalArgv: string[];

  beforeEach(() => {
    originalExecPath = process.execPath;
    originalArgv = process.argv;
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
    process.exitCode = undefined;
    jest.clearAllMocks();

    mockedExecAsync.mockReset();
    mockedGetLatestVersion.mockReset();
    mockedIsRunningUnderNpx.mockReset();
    mockedTelemetry.record.mockReset();
    mockedExecSync.mockReset();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    process.exitCode = undefined;
    process.execPath = originalExecPath;
    process.argv = originalArgv;
  });

  it('should register the upgrade command', () => {
    upgradeCommand(program);

    expect(program.command).toHaveBeenCalledWith('upgrade');
    expect(mockCommand.description).toHaveBeenCalledWith(
      'Upgrade promptfoo to the latest version or a specific version',
    );
    expect(mockCommand.option).toHaveBeenCalledWith(
      '--version <version>',
      'Upgrade to a specific version',
    );
    expect(mockCommand.option).toHaveBeenCalledWith(
      '--check',
      'Check for updates without upgrading',
    );
    expect(mockCommand.option).toHaveBeenCalledWith(
      '--force',
      'Force upgrade even if already on the target version',
    );
    expect(mockCommand.option).toHaveBeenCalledWith(
      '--dry-run',
      'Show what would be done without actually upgrading',
    );
  });

  describe('installation detection', () => {
    it('should detect npx installation', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ check: true });

      expect(mockedIsRunningUnderNpx).toHaveBeenCalledWith();
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
      mockedExecAsync.mockRejectedValueOnce(new Error('npm not found')).mockResolvedValueOnce({
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

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('You are on the latest version'),
      );
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
      mockedExecSync.mockImplementation(() => Buffer.from(''));

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(mockedExecSync).toHaveBeenCalledWith('npm install -g promptfoo@latest', {
        stdio: 'inherit',
      });
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
      mockedExecSync.mockImplementation(() => Buffer.from(''));

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ version: '1.5.0' });

      expect(mockedExecSync).toHaveBeenCalledWith('npm install -g promptfoo@1.5.0', {
        stdio: 'inherit',
      });
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

      expect(mockedExecSync).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Dry run mode'));
    });

    it('should handle npx with special message', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(true);
      mockedGetLatestVersion.mockResolvedValue('2.0.0');

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('running promptfoo via npx'),
      );
      expect(mockedExecSync).not.toHaveBeenCalled();
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
      mockedExecSync.mockImplementation(() => Buffer.from(''));

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ force: true });

      expect(mockedExecSync).toHaveBeenCalledWith(`npm install -g promptfoo@latest`, {
        stdio: 'inherit',
      });
    });

    it('should handle upgrade errors gracefully', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
        stderr: '',
      });
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      mockedExecSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to upgrade'));
      expect(process.exitCode).toBe(1);
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
      expect(process.exitCode).toBe(1);
    });

    it('should handle binary installation error', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockRejectedValueOnce(new Error('Not found'));
      process.argv = ['/usr/local/bin/node', '/usr/local/bin/promptfoo'];
      mockedGetLatestVersion.mockResolvedValue('2.0.0');

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Binary installations cannot be upgraded automatically'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle homebrew specific version error', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      process.execPath = '/opt/homebrew/Cellar/node/20.0.0/bin/node';
      mockedExecAsync.mockResolvedValueOnce({
        stdout: '1.5.0',
        stderr: '',
      });

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ version: '1.5.0' });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Homebrew does not support installing specific versions'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should allow homebrew upgrade with version latest', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      process.execPath = '/opt/homebrew/Cellar/node/20.0.0/bin/node';
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      mockedExecSync.mockImplementation(() => Buffer.from(''));
      mockedExecAsync.mockResolvedValueOnce({
        stdout: '2.0.0',
        stderr: '',
      });

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({ version: 'latest' });

      expect(mockedExecSync).toHaveBeenCalledWith('brew upgrade promptfoo', { stdio: 'inherit' });
    });

    it('should handle unknown installation method', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync
        .mockRejectedValueOnce(new Error('npm not found'))
        .mockRejectedValueOnce(new Error('yarn not found'))
        .mockRejectedValueOnce(new Error('pnpm not found'));
      process.argv = ['/usr/local/bin/node', '/usr/local/bin/node_modules/promptfoo/bin/cli.js'];
      mockedGetLatestVersion.mockResolvedValue('2.0.0');

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not detect installation method'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('telemetry', () => {
    it('should record successful upgrade', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      mockedExecSync.mockImplementation(() => Buffer.from(''));

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];

      mockedExecAsync
        .mockResolvedValueOnce({
          stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
          stderr: '',
        })
        .mockResolvedValueOnce({
          stdout: '2.0.0',
          stderr: '',
        });

      await action({});

      expect(mockedTelemetry.record).toHaveBeenCalledTimes(2);
      expect(mockedTelemetry.record).toHaveBeenNthCalledWith(2, 'command_used', {
        name: 'upgrade:completed',
        from_version: VERSION,
        to_version: '2.0.0',
        install_method: 'npm-global',
        forced: false,
      });
    });

    it('should record failed upgrade', async () => {
      mockedIsRunningUnderNpx.mockReturnValue(false);
      mockedExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({ dependencies: { promptfoo: { version: '1.0.0' } } }),
        stderr: '',
      });
      mockedGetLatestVersion.mockResolvedValue('2.0.0');
      mockedExecSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      upgradeCommand(program);
      const action = mockAction.mock.calls[0][0];
      await action({});

      expect(mockedTelemetry.record).toHaveBeenCalledWith('command_used', {
        name: 'upgrade:failed',
        error: 'Permission denied',
      });
    });
  });
});
