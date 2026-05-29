import { afterEach, beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';

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
import { tmpdir } from 'node:os';
import type { ChildProcess } from 'node:child_process';

import { Command } from 'commander';
import { updateCommand } from '../../src/commands/update';
import logger from '../../src/logger';
import telemetry from '../../src/telemetry';
import { getInstallationInfo, PackageManager } from '../../src/updates/installationInfo';
import { checkForUpdates, UPDATE_INSTRUCTIONS } from '../../src/updates/updateCheck';

const mockCheckForUpdates = checkForUpdates as MockedFunction<typeof checkForUpdates>;
const mockGetInstallationInfo = getInstallationInfo as MockedFunction<typeof getInstallationInfo>;
const mockSpawn = spawn as MockedFunction<typeof spawn>;

function createMockProcess({
  closeCode,
  closeSignal,
  error,
}: {
  closeCode?: number | null;
  closeSignal?: NodeJS.Signals | null;
  error?: Error;
}) {
  const mockProcess = {
    on: vi.fn(
      (
        event: string,
        callback: (value: Error | number | null, signal?: NodeJS.Signals | null) => void,
      ) => {
        if (event === 'close' && (closeCode !== undefined || closeSignal !== undefined)) {
          setTimeout(() => callback(closeCode ?? null, closeSignal ?? null), 10);
        }
        if (event === 'error' && error) {
          setTimeout(() => callback(error), 10);
        }
        return mockProcess;
      },
    ),
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
  let originalPlatform: string;

  beforeEach(() => {
    program = new Command();
    vi.clearAllMocks();
    mockCheckForUpdates.mockReset();
    mockGetInstallationInfo.mockReset();
    mockSpawn.mockReset();
    process.exitCode = undefined;
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    vi.unstubAllEnvs();
  });

  it('should leave command telemetry to the shared CLI hook', async () => {
    mockCheckForUpdates.mockResolvedValue(null);

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update']);

    expect(mockCheckForUpdates).toHaveBeenCalledWith({ throwOnError: true });
    expect(telemetry.record).not.toHaveBeenCalled();
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
    expect(logger.info).toHaveBeenCalledWith(UPDATE_INSTRUCTIONS);
  });

  it('should report a skipped check when update checks are disabled', async () => {
    vi.stubEnv('PROMPTFOO_DISABLE_UPDATE', 'true');

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update', '--check']);

    expect(mockCheckForUpdates).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      'Update check skipped because PROMPTFOO_DISABLE_UPDATE is enabled.',
    );
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

    expect(mockGetInstallationInfo).toHaveBeenCalledWith(process.cwd(), true, process.env);
    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'promptfoo@1.1.0'],
      expect.objectContaining({
        cwd: tmpdir(),
        env: expect.any(Object),
        stdio: 'inherit',
        shell: false,
      }),
    );
  });

  it('should invoke Windows package manager shims through cmd.exe', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const sourceEnvironment = { ComSpec: 'C:\\Windows\\System32\\cmd.exe', PATH: 'C:\\safe' };
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
      updateCommand: 'npm.cmd install -g promptfoo@latest',
      updateMessage: 'Installed with npm.',
    });

    mockSpawn.mockReturnValue(createMockProcess({ closeCode: 0 }));

    updateCommand(program, sourceEnvironment);
    await program.parseAsync(['node', 'test', 'update']);

    expect(mockSpawn).toHaveBeenCalledWith(
      sourceEnvironment.ComSpec,
      ['/d', '/s', '/c', 'npm.cmd', 'install', '-g', 'promptfoo@1.1.0'],
      expect.objectContaining({
        cwd: tmpdir(),
        env: expect.any(Object),
        stdio: 'inherit',
        shell: false,
      }),
    );
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

    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'promptfoo@latest'],
      expect.objectContaining({
        cwd: tmpdir(),
        env: expect.any(Object),
        stdio: 'inherit',
        shell: false,
      }),
    );
  });

  it('should force reinstall with the latest package tag when update checks are disabled', async () => {
    vi.stubEnv('PROMPTFOO_DISABLE_UPDATE', 'true');
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

    expect(mockCheckForUpdates).toHaveBeenCalledWith({ throwOnError: true });
    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'promptfoo@latest'],
      expect.objectContaining({
        cwd: tmpdir(),
        env: expect.any(Object),
        stdio: 'inherit',
        shell: false,
      }),
    );
  });

  it('should force update with the latest package tag when version checking fails', async () => {
    mockCheckForUpdates.mockRejectedValue(new Error('network unavailable'));
    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
      updateMessage: 'Installed with npm.',
    });
    mockSpawn.mockReturnValue(createMockProcess({ closeCode: 0 }));

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update', '--force']);

    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'promptfoo@latest'],
      expect.objectContaining({
        cwd: tmpdir(),
        env: expect.any(Object),
        stdio: 'inherit',
        shell: false,
      }),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('should run manual updates without forwarding evaluation credentials', async () => {
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
    mockSpawn.mockReturnValue(createMockProcess({ closeCode: 0 }));

    updateCommand(program, {
      PATH: '/untrusted/project/node_modules/.bin:/safe/bin',
      HOME: '/home/user',
      NPM_CONFIG_PREFIX: '/safe/npm-global',
      OPENAI_API_KEY: 'not-for-installer',
      NPM_TOKEN: 'not-for-installer',
    });
    await program.parseAsync(['node', 'test', 'update']);

    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '-g', 'promptfoo@1.1.0'], {
      cwd: tmpdir(),
      env: { PATH: '/safe/bin', HOME: '/home/user', NPM_CONFIG_PREFIX: '/safe/npm-global' },
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

  it('should report signal termination for the manual update command', async () => {
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

    mockSpawn.mockReturnValue(createMockProcess({ closeCode: null, closeSignal: 'SIGTERM' }));

    updateCommand(program);
    await program.parseAsync(['node', 'test', 'update']);

    expect(logger.error).toHaveBeenCalledWith('Update failed after receiving signal SIGTERM');
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
