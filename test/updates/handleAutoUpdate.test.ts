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
import type { ChildProcess } from 'node:child_process';

import {
  handleAutoUpdate,
  scheduleAutoUpdateOnExit,
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockProcess = {
      on: vi.fn(),
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
  });

  function getProcessEventHandler<T extends (...args: any[]) => void>(eventName: string): T {
    const handler = (mockProcess.on as Mock).mock.calls.find((call) => call[0] === eventName)?.[1];
    expect(handler).toBeTypeOf('function');
    return handler as T;
  }

  it('should return early if no update info provided', () => {
    const result = handleAutoUpdate(null, false, false, '/project', mockSpawn);
    expect(result).toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should return early if update nag is disabled', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    const result = handleAutoUpdate(info, true, false, '/project', mockSpawn);
    expect(result).toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should emit update-received event with combined message', () => {
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

    handleAutoUpdate(info, false, false, '/project', mockSpawn);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-received', {
      message: 'Update available\nRun npm install -g promptfoo@latest',
    });
  });

  it('should return early if no update command available', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPX,
      isGlobal: false,
      updateMessage: 'Running via npx',
    });

    const result = handleAutoUpdate(info, false, false, '/project', mockSpawn);
    expect(result).toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should return early if auto-update is disabled', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const result = handleAutoUpdate(info, false, true, '/project', mockSpawn);
    expect(result).toBeUndefined();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('should spawn update process with correct arguments', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    handleAutoUpdate(info, false, false, '/project', mockSpawn);

    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '-g', 'promptfoo@1.1.0'], {
      stdio: 'ignore',
      shell: false,
      detached: true,
    });
  });

  it('should emit update-success on successful update', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    handleAutoUpdate(info, false, false, '/project', mockSpawn);

    const closeHandler = getProcessEventHandler<(code: number) => void>('close');
    closeHandler(0);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-success', {
      message: 'Update successful! The new version will be used on your next run.',
    });
  });

  it('should emit update-failed on failed update', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    handleAutoUpdate(info, false, false, '/project', mockSpawn);

    const closeHandler = getProcessEventHandler<(code: number) => void>('close');
    closeHandler(1);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed with exit code 1. Please try updating manually: npm install -g promptfoo@latest',
    });
  });

  it('should emit update-failed on process error with sanitized message', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    handleAutoUpdate(info, false, false, '/project', mockSpawn);

    const errorHandler = getProcessEventHandler<(error: Error) => void>('error');
    const err = new Error('ENOENT');
    err.name = 'Error';
    errorHandler(err);

    expect(mockUpdateEventEmitter.emit).toHaveBeenCalledWith('update-failed', {
      message:
        'Automatic update failed (Error). Please try updating manually: npm install -g promptfoo@latest',
    });
  });

  it('should return the spawned process', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    const result = handleAutoUpdate(info, false, false, '/project', mockSpawn);
    expect(result).toBe(mockProcess);
  });

  it('should wait until process exit before starting an automatic update', () => {
    const info: UpdateObject = {
      message: 'Update available',
      update: { current: '1.0.0', latest: '1.1.0', name: 'promptfoo' },
    };
    let beforeExit: (() => void) | undefined;

    mockGetInstallationInfo.mockReturnValue({
      packageManager: PackageManager.NPM,
      isGlobal: true,
      updateCommand: 'npm install -g promptfoo@latest',
    });

    scheduleAutoUpdateOnExit(
      info,
      false,
      '/project',
      (listener) => {
        beforeExit = listener;
      },
      mockSpawn,
    );

    expect(mockSpawn).not.toHaveBeenCalled();
    beforeExit?.();
    expect(mockSpawn).toHaveBeenCalledWith('npm', ['install', '-g', 'promptfoo@1.1.0'], {
      stdio: 'ignore',
      shell: false,
      detached: true,
    });
  });
});

describe('setUpdateHandler', () => {
  let realEmitter: EventEmitter;
  let onUpdateReceived: Mock;
  let onUpdateSuccess: Mock;
  let onUpdateFailed: Mock;

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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call onUpdateReceived when update-received event is emitted', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-received', { message: 'Update available' });

    expect(onUpdateReceived).toHaveBeenCalledWith({ message: 'Update available' });
  });

  it('should call onUpdateSuccess when update-success event is emitted', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-success', { message: 'Update complete' });

    expect(onUpdateSuccess).toHaveBeenCalledWith({ message: 'Update complete' });
  });

  it('should call onUpdateFailed when update-failed event is emitted', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-failed', { message: 'Update failed' });

    expect(onUpdateFailed).toHaveBeenCalledWith({ message: 'Update failed' });
  });

  it('should repeat onUpdateReceived after 60 seconds if not successful', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    expect(onUpdateReceived).toHaveBeenCalledTimes(2);
    expect(onUpdateReceived).toHaveBeenLastCalledWith({ message: 'Update available' });
  });

  it('should not repeat onUpdateReceived if update succeeds', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    realEmitter.emit('update-success', { message: 'Update complete' });

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    // Should not be called again
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);
  });

  it('should repeat reminders for a later update after an earlier success', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

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
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    realEmitter.emit('update-failed', { message: 'Update failed' });

    // Fast-forward 60 seconds
    vi.advanceTimersByTime(60000);

    // Should not be called again
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);
  });

  it('should return cleanup function that removes listeners', () => {
    const cleanup = setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    cleanup();

    realEmitter.emit('update-received', { message: 'Update available' });
    realEmitter.emit('update-success', { message: 'Update complete' });
    realEmitter.emit('update-failed', { message: 'Update failed' });

    expect(onUpdateReceived).not.toHaveBeenCalled();
    expect(onUpdateSuccess).not.toHaveBeenCalled();
    expect(onUpdateFailed).not.toHaveBeenCalled();
  });
});
