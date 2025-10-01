jest.mock('../updates/updateCheck');
jest.mock('../updates/installationInfo');
jest.mock('node:child_process');

import { Command } from 'commander';
import { updateCommand } from './update';
import { checkForUpdates } from '../updates/updateCheck';
import { getInstallationInfo, PackageManager } from '../updates/installationInfo';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

const mockCheckForUpdates = checkForUpdates as jest.MockedFunction<typeof checkForUpdates>;
const mockGetInstallationInfo = getInstallationInfo as jest.MockedFunction<
  typeof getInstallationInfo
>;
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('update command', () => {
  let program: Command;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    program = new Command();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should show already up to date message when no update available', async () => {
    mockCheckForUpdates.mockResolvedValue(null);

    updateCommand(program);
    program.parse(['node', 'test', 'update']);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockCheckForUpdates).toHaveBeenCalled();
  });

  it('should show update info when --check flag is used', async () => {
    mockCheckForUpdates.mockResolvedValue({
      message: 'Update available: 1.0.0 → 1.1.0',
      update: {
        current: '1.0.0',
        latest: '1.1.0',
        name: 'promptfoo',
      },
    });

    updateCommand(program);
    program.parse(['node', 'test', 'update', '--check']);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockCheckForUpdates).toHaveBeenCalled();
  });

  it('should handle installation info and run update command', async () => {
    const mockProcess = {
      on: jest.fn((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockProcess;
      }),
      removeAllListeners: jest.fn(),
      stdin: null,
      stdout: null,
      stderr: null,
      stdio: null,
      killed: false,
      pid: 123,
      connected: true,
      exitCode: null,
      signalCode: null,
      spawnargs: [],
      spawnfile: '',
    } as unknown as ChildProcess;

    mockCheckForUpdates.mockResolvedValue({
      message: 'Update available: 1.0.0 → 1.1.0',
      update: {
        current: '1.0.0',
        latest: '1.1.0',
        name: 'promptfoo',
      },
    });

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
      updateMessage: 'Installed with npm. Attempting to automatically update now...',
    });

    mockSpawn.mockReturnValue(mockProcess);

    updateCommand(program);
    program.parse(['node', 'test', 'update']);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetInstallationInfo).toHaveBeenCalledWith(process.cwd(), true);
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '-g', 'promptfoo@1.1.0'], {
      stdio: 'inherit',
      shell: false,
    });
  });

  it('should handle installations that cannot be auto-updated', async () => {
    mockCheckForUpdates.mockResolvedValue({
      message: 'Update available: 1.0.0 → 1.1.0',
      update: {
        current: '1.0.0',
        latest: '1.1.0',
        name: 'promptfoo',
      },
    });

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPX,
      isGlobal: false,
      updateMessage: 'Running via npx, update not applicable.',
    });

    updateCommand(program);
    program.parse(['node', 'test', 'update']);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockGetInstallationInfo).toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should force update even when on latest version', async () => {
    const mockProcess = {
      on: jest.fn((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockProcess;
      }),
      removeAllListeners: jest.fn(),
      stdin: null,
      stdout: null,
      stderr: null,
      stdio: null,
      killed: false,
      pid: 123,
      connected: true,
      exitCode: null,
      signalCode: null,
      spawnargs: [],
      spawnfile: '',
    } as unknown as ChildProcess;

    mockCheckForUpdates.mockResolvedValue(null);

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
      updateMessage: 'Installed with npm.',
    });

    mockSpawn.mockReturnValue(mockProcess);

    updateCommand(program);
    program.parse(['node', 'test', 'update', '--force']);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '-g', 'promptfoo@latest'], {
      stdio: 'inherit',
      shell: false,
    });
  });
});
