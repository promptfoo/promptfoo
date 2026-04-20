import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';

vi.mock('../../src/updates/updateCheck');
vi.mock('../../src/updates/installationInfo');
vi.mock('node:child_process');
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

import { Command } from 'commander';
import { updateCommand } from '../../src/commands/update';
import { getInstallationInfo, PackageManager } from '../../src/updates/installationInfo';
import { checkForUpdates } from '../../src/updates/updateCheck';

const mockCheckForUpdates = checkForUpdates as MockedFunction<typeof checkForUpdates>;
const mockGetInstallationInfo = getInstallationInfo as MockedFunction<typeof getInstallationInfo>;
const mockSpawn = spawn as MockedFunction<typeof spawn>;

function createMockProcess({ closeCode, error }: { closeCode?: number; error?: Error }) {
  const mockProcess = {
    on: vi.fn((event: string, callback: (value: Error | number) => void) => {
      if (event === 'close' && closeCode !== undefined) {
        setTimeout(() => callback(closeCode), 10);
      }
      if (event === 'error' && error) {
        setTimeout(() => callback(error), 10);
      }
      return mockProcess;
    }),
    removeAllListeners: vi.fn(),
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

  return mockProcess;
}

describe('update command', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('should show already up to date message when no update available', async () => {
    mockCheckForUpdates.mockResolvedValue(null);

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update']);

    expect(mockCheckForUpdates).toHaveBeenCalledWith({ throwOnError: true });
  });

  it('should show latest message in check mode when no update is available', async () => {
    mockCheckForUpdates.mockResolvedValue(null);

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update', '--check']);

    expect(mockCheckForUpdates).toHaveBeenCalledWith({ throwOnError: true });
    expect(mockGetInstallationInfo).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
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
    await program.parseAsync(['node', 'test', 'update', '--check']);

    expect(mockCheckForUpdates).toHaveBeenCalledWith({ throwOnError: true });
  });

  it('should handle installation info and run update command', async () => {
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

    mockSpawn.mockReturnValue(createMockProcess({ closeCode: 0 }));

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update']);

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
    await program.parseAsync(['node', 'test', 'update']);

    expect(mockGetInstallationInfo).toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should force update even when on latest version', async () => {
    mockCheckForUpdates.mockResolvedValue(null);

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
      updateMessage: 'Installed with npm.',
    });

    mockSpawn.mockReturnValue(createMockProcess({ closeCode: 0 }));

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update', '--force']);

    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '-g', 'promptfoo@latest'], {
      stdio: 'inherit',
      shell: false,
    });
  });

  it('should set exitCode when the update command exits unsuccessfully', async () => {
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
      updateMessage: 'Installed with npm.',
    });

    mockSpawn.mockReturnValue(createMockProcess({ closeCode: 1 }));

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update']);

    expect(process.exitCode).toBe(1);
  });

  it('should set exitCode when spawning the update command fails', async () => {
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
      updateMessage: 'Installed with npm.',
    });

    mockSpawn.mockReturnValue(createMockProcess({ error: new Error('spawn ENOENT') }));

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update']);

    expect(process.exitCode).toBe(1);
  });
});
