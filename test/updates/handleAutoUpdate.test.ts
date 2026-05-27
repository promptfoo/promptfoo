import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  type Mocked,
  type MockedFunction,
  vi,
} from 'vitest';

vi.mock('../../src/updates/installationInfo');
vi.mock('../../src/updates/updateEventEmitter');

import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import type { ChildProcess } from 'node:child_process';

import {
  AUTO_UPDATE_TIMEOUT_MS,
  handleAutoUpdate,
  setUpdateHandler,
} from '../../src/updates/handleAutoUpdate';
import { getInstallationInfo, PackageManager } from '../../src/updates/installationInfo';
import { updateEventEmitter } from '../../src/updates/updateEventEmitter';

import type { UpdateObject } from '../../src/updates/updateCheck';

const mockGetInstallationInfo = getInstallationInfo as MockedFunction<typeof getInstallationInfo>;
const mockUpdateEventEmitter = updateEventEmitter as Mocked<typeof updateEventEmitter>;

describe('handleAutoUpdate', () => {
  let mockSpawn: Mock;
  let mockProcess: Partial<ChildProcess>;
  let originalPlatform: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });

    mockProcess = {
      on: vi.fn(),
      kill: vi.fn(),
      unref: vi.fn(),
      stderr: {
        on: vi.fn(),
      } as any,
      pid: 12345,
    };

    mockSpawn = vi.fn(() => mockProcess);
    mockUpdateEventEmitter.emit = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  function getProcessEventHandler<T extends (...args: any[]) => void>(eventName: string): T {
    const handler = (mockProcess.on as Mock).mock.calls.find((call) => call[0] === eventName)?.[1];
    expect(handler).toBeTypeOf('function');
    return handler as T;
  }

  it('should return early if no update info provided', async () => {
    await expect(
      handleAutoUpdate(null, false, false, '/project', mockSpawn),
    ).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should return early if update nag is disabled', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    await expect(
      handleAutoUpdate(info, true, false, '/project', mockSpawn),
    ).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should emit update-received event with combined message', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
      updateMessage: 'Run npm install -g promptfoo@latest',
    });

    const updatePromise = handleAutoUpdate(info, false, false, '/project', mockSpawn);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-received', {
      message: 'Update available\nRun npm install -g promptfoo@latest',
    });
    getProcessEventHandler<(code: number) => void>('close')(0);
    await updatePromise;
  });

  it('should return early if no update command available', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPX,
      isGlobal: false,
      updateMessage: 'Running via npx',
    });

    await expect(
      handleAutoUpdate(info, false, false, '/project', mockSpawn),
    ).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should return early if auto-update is disabled', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    await expect(
      handleAutoUpdate(info, false, true, '/project', mockSpawn),
    ).resolves.toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should spawn update process with correct arguments and await completion', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    let complete = false;
    const updatePromise = handleAutoUpdate(info, false, false, '/project', mockSpawn).then(() => {
      complete = true;
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      'npm',
      ['install', '-g', 'promptfoo@1.1.0'],
      expect.objectContaining({
        cwd: tmpdir(),
        env: expect.any(Object),
        stdio: 'ignore',
        shell: false,
        detached: false,
      }),
    );
    expect(complete).toBe(false);
    getProcessEventHandler<(code: number) => void>('close')(0);
    await updatePromise;
    expect(complete).toBe(true);
  });

  it('should not run automatic installation while the Windows process is still live', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm.cmd install -g promptfoo@latest',
    });

    const sourceEnvironment = { ComSpec: 'C:\\Windows\\System32\\cmd.exe', PATH: 'C:\\safe' };
    await handleAutoUpdate(info, false, false, '/project', mockSpawn, sourceEnvironment);

    expect(mockGetInstallationInfo).toHaveBeenCalledWith('/project', true, sourceEnvironment);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should not run automatic installation on an unsupported non-Windows platform', async () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd' });
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const sourceEnvironment = { PATH: '/safe' };
    await handleAutoUpdate(info, false, false, '/project', mockSpawn, sourceEnvironment);

    expect(mockGetInstallationInfo).toHaveBeenCalledWith('/project', true, sourceEnvironment);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should run automatic updates without forwarding evaluation credentials', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const updatePromise = handleAutoUpdate(info, false, false, '/untrusted/project', mockSpawn, {
      PATH: '/safe/bin',
      HOME: '/home/user',
      OPENAI_API_KEY: 'not-for-installer',
      NPM_TOKEN: 'not-for-installer',
    });

    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '-g', 'promptfoo@1.1.0'], {
      cwd: tmpdir(),
      env: { PATH: '/safe/bin', HOME: '/home/user' },
      stdio: 'ignore',
      shell: false,
      detached: false,
    });
    getProcessEventHandler<(code: number) => void>('close')(0);
    await updatePromise;
  });

  it('should emit update-success on successful update', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const updatePromise = handleAutoUpdate(info, false, false, '/project', mockSpawn);

    const closeHandler = getProcessEventHandler<(code: number) => void>('close');
    closeHandler(0);
    await updatePromise;

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-success', {
      message: 'Update successful! The new version will be used on your next run.',
    });
  });

  it('should emit update-failed on failed update', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const updatePromise = handleAutoUpdate(info, false, false, '/project', mockSpawn);

    const closeHandler = getProcessEventHandler<(code: number) => void>('close');
    closeHandler(1);
    await updatePromise;

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed with exit code 1. Please try updating manually: npm install -g promptfoo@latest',
    });
  });

  it('should emit update-failed on process error with sanitized message', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const updatePromise = handleAutoUpdate(info, false, false, '/project', mockSpawn);

    const errorHandler = getProcessEventHandler<(error: Error) => void>('error');
    const err = new Error('ENOENT');
    err.name = 'Error';
    errorHandler(err);
    await updatePromise;

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed (Error). Please try updating manually: npm install -g promptfoo@latest',
    });
  });

  it('should emit only one terminal event if process reports an error and then closes', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const updatePromise = handleAutoUpdate(info, false, false, '/project', mockSpawn);
    getProcessEventHandler<(error: Error) => void>('error')(new Error('failed'));
    getProcessEventHandler<(code: number) => void>('close')(1);
    await updatePromise;

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledTimes(2);
    expect(mockUpdateEventEmitter.emit).toHaveBeenLastCalledWith('update-failed', {
      message:
        'Automatic update failed (Error). Please try updating manually: npm install -g promptfoo@latest',
    });
  });

  it('should stop waiting for a slow automatic update without terminating installation', async () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const updatePromise = handleAutoUpdate(info, false, false, '/project', mockSpawn);
    await vi.advanceTimersByTimeAsync(AUTO_UPDATE_TIMEOUT_MS);
    await updatePromise;

    expect(mockProcess.kill).not.toHaveBeenCalled();
    expect(mockProcess.unref).toHaveBeenCalled();
    expect(mockUpdateEventEmitter.emit).toHaveBeenLastCalledWith('update-background', {
      message:
        'Automatic update is still running after 60 seconds and will continue in the background. Wait before running promptfoo again; installation success is not yet known.',
    });
  });
});

describe('setUpdateHandler', () => {
  let realEmitter: EventEmitter;
  let onUpdateReceived: Mock;
  let onUpdateSuccess: Mock;
  let onUpdateFailed: Mock;
  let onUpdateBackground: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create a real EventEmitter for testing
    realEmitter = new EventEmitter();
    mockUpdateEventEmitter.on = realEmitter.on.bind(realEmitter) as any;
    mockUpdateEventEmitter.off = realEmitter.off.bind(realEmitter) as any;
    mockUpdateEventEmitter.emit = realEmitter.emit.bind(realEmitter) as any;

    onUpdateReceived = vi.fn();
    onUpdateSuccess = vi.fn();
    onUpdateFailed = vi.fn();
    onUpdateBackground = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call onUpdateReceived when update-received event is emitted', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-received', { message: 'Update available' });

    expect(onUpdateReceived).toHaveBeenCalledWith({ message: 'Update available' });
  });

  it('should call onUpdateSuccess when update-success event is emitted', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-success', { message: 'Update complete' });

    expect(onUpdateSuccess).toHaveBeenCalledWith({ message: 'Update complete' });
  });

  it('should call onUpdateFailed when update-failed event is emitted', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-failed', { message: 'Update failed' });

    expect(onUpdateFailed).toHaveBeenCalledWith({ message: 'Update failed' });
  });

  it('should call onUpdateBackground when an installation keeps running after the wait limit', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-background', { message: 'Update still running' });

    expect(onUpdateBackground).toHaveBeenCalledWith({ message: 'Update still running' });
  });

  it('should repeat onUpdateReceived after 60 seconds if not successful', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    expect(onUpdateReceived).toHaveBeenCalledTimes(2);
    expect(onUpdateReceived).toHaveBeenLastCalledWith({ message: 'Update available' });
  });

  it('should not repeat onUpdateReceived if update succeeds', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    realEmitter.emit('update-success', { message: 'Update complete' });

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    // Should not be called again
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);
  });

  it('should repeat reminders for a later update after an earlier success', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-received', { message: 'First update available' });
    realEmitter.emit('update-success', { message: 'First update complete' });
    vi.advanceTimersByTime(60000);
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    realEmitter.emit('update-received', { message: 'Second update available' });
    vi.advanceTimersByTime(60000);

    expect(onUpdateReceived).toHaveBeenCalledTimes(3);
    expect(onUpdateReceived).toHaveBeenLastCalledWith({ message: 'Second update available' });
  });

  it('should not repeat onUpdateReceived if update fails', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed, onUpdateBackground);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    realEmitter.emit('update-failed', { message: 'Update failed' });

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    // Should not be called again
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);
  });

  it('should return cleanup function that removes listeners', () => {
    const cleanup = setUpdateHandler(
      onUpdateReceived,
      onUpdateSuccess,
      onUpdateFailed,
      onUpdateBackground,
    );

    cleanup();

    realEmitter.emit('update-received', { message: 'Update available' });
    realEmitter.emit('update-success', { message: 'Update complete' });
    realEmitter.emit('update-failed', { message: 'Update failed' });
    realEmitter.emit('update-background', { message: 'Update still running' });

    expect(onUpdateReceived).not.toHaveBeenCalled();
    expect(onUpdateSuccess).not.toHaveBeenCalled();
    expect(onUpdateFailed).not.toHaveBeenCalled();
    expect(onUpdateBackground).not.toHaveBeenCalled();
  });
});
