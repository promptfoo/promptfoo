import { execSync } from 'child_process';
import { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { updateCommand, detectInstallMethod } from '../../src/commands/update';
import { VERSION } from '../../src/constants';
import { getLatestVersion } from '../../src/updates';
import { isRunningUnderNpx } from '../../src/util';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs');
jest.mock('../../src/updates');
jest.mock('../../src/util');
jest.mock('../../src/logger');

// Create a mock spinner that we can check
const mockSpinner = {
  start: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  warn: jest.fn().mockReturnThis(),
  info: jest.fn().mockReturnThis(),
};

jest.mock('ora', () => {
  return function () {
    return mockSpinner;
  };
});

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('update command', () => {
  let program: Command;
  const mockExecSync = jest.mocked(execSync);
  const mockGetLatestVersion = jest.mocked(getLatestVersion);
  const mockIsRunningUnderNpx = jest.mocked(isRunningUnderNpx);
  const MOCK_BIN_PATH = '/usr/local/bin/promptfoo';
  const MOCK_BACKUP_DIR = path.join(os.tmpdir(), `promptfoo-backup-${VERSION}`);
  const MOCK_BACKUP_PATH = path.join(MOCK_BACKUP_DIR, 'promptfoo');

  beforeEach(() => {
    program = new Command();
    jest.clearAllMocks();

    // Reset platform to default
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    // Mock process.argv[1] for backup path
    Object.defineProperty(process, 'argv', {
      value: ['node', MOCK_BIN_PATH],
    });

    // Default mocks
    mockExecSync.mockReturnValue('');
    mockGetLatestVersion.mockResolvedValue('0.102.1');
    mockIsRunningUnderNpx.mockReturnValue(false);

    // Mock fs functions
    jest.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    jest.mocked(fs.copyFileSync).mockImplementation(() => undefined);
    jest.mocked(fs.chmodSync).mockImplementation(() => undefined);
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.rmSync).mockImplementation(() => undefined);
  });

  afterEach(() => {
    mockExit.mockClear();
  });

  describe('detectInstallMethod', () => {
    it('should detect npx installation', async () => {
      mockIsRunningUnderNpx.mockReturnValue(true);
      await expect(detectInstallMethod()).resolves.toBe('npx');
    });

    it('should detect npm installation', async () => {
      // Clear any previous mock implementations
      mockExecSync.mockReset();
      // Only return success for npm check
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.includes('npm list')) {
          return 'promptfoo@0.102.1';
        }
        return '';
      });
      await expect(detectInstallMethod()).resolves.toBe('npm');
    });

    it('should detect homebrew installation on non-Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.includes('brew')) {
          return 'promptfoo';
        }
        return '';
      });
      await expect(detectInstallMethod()).resolves.toBe('homebrew');
    });

    it('should return unknown for unrecognized installation', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command failed');
      });
      await expect(detectInstallMethod()).resolves.toBe('unknown');
    });
  });

  describe('update command execution', () => {
    it('should show success when already on latest version', async () => {
      mockGetLatestVersion.mockResolvedValue('0.97.1000');

      updateCommand(program);
      await program.parseAsync(['node', 'test', 'update']);

      expect(mockSpinner.succeed).toHaveBeenCalledWith(
        'You are already running the latest version!',
      );
    });

    it('should handle npm update successfully', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.includes('npm list')) {
          return 'promptfoo';
        }
        return '';
      });

      updateCommand(program);
      await program.parseAsync(['node', 'test', 'update']);

      expect(mockExecSync).toHaveBeenCalledWith(
        'npm install -g promptfoo@latest',
        expect.any(Object),
      );
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Update successful!');
    });

    it('should handle homebrew update successfully', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.includes('brew list')) {
          return 'promptfoo';
        }
        return '';
      });

      updateCommand(program);
      await program.parseAsync(['node', 'test', 'update']);

      expect(mockExecSync).toHaveBeenCalledWith('brew upgrade promptfoo', expect.any(Object));
      expect(mockSpinner.succeed).toHaveBeenCalledWith('Update successful!');
    });

    it('should handle npx case appropriately', async () => {
      mockIsRunningUnderNpx.mockReturnValue(true);

      updateCommand(program);
      await program.parseAsync(['node', 'test', 'update']);

      expect(mockSpinner.info).toHaveBeenCalledWith(
        expect.stringContaining('running promptfoo via npx'),
      );
    });

    it('should create and cleanup backup correctly', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.includes('npm list')) {
          return 'promptfoo';
        }
        return '';
      });

      updateCommand(program);
      await program.parseAsync(['node', 'test', 'update']);

      expect(fs.mkdirSync).toHaveBeenCalledWith(MOCK_BACKUP_DIR, { recursive: true });
      expect(fs.copyFileSync).toHaveBeenCalledWith(MOCK_BIN_PATH, MOCK_BACKUP_PATH);
      expect(fs.chmodSync).toHaveBeenCalledWith(MOCK_BACKUP_PATH, 0o755);
      expect(fs.rmSync).toHaveBeenCalledWith(MOCK_BACKUP_DIR, { recursive: true, force: true });
    });

    it('should handle update failure and rollback', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.includes('npm list')) {
          return 'promptfoo';
        }
        if (cmd.includes('npm install')) {
          throw new Error('Update failed');
        }
        return '';
      });

      updateCommand(program);
      await program.parseAsync(['node', 'test', 'update']);

      expect(fs.copyFileSync).toHaveBeenCalledTimes(2); // Initial backup and restore
      expect(mockSpinner.fail).toHaveBeenCalledWith('Update failed');
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should show friendly message about duplicate notifications', async () => {
      mockExecSync.mockImplementation((cmd) => {
        if (cmd.includes('npm list')) {
          return 'promptfoo';
        }
        return '';
      });

      updateCommand(program);
      await program.parseAsync(['node', 'test', 'update']);

      expect(mockSpinner.info).toHaveBeenCalledWith(
        expect.stringContaining('ignore the update notification above'),
      );
    });
  });
});
