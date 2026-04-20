jest.mock('./installationInfo');
jest.mock('./updateEventEmitter');

import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { handleAutoUpdate, setUpdateHandler } from './handleAutoUpdate';
import type { UpdateObject } from './updateCheck';
import { getInstallationInfo, PackageManager } from './installationInfo';
import { updateEventEmitter } from './updateEventEmitter';

const mockGetInstallationInfo = getInstallationInfo as jest.MockedFunction<
  typeof getInstallationInfo
>;
const mockUpdateEventEmitter = updateEventEmitter as jest.Mocked<typeof updateEventEmitter>;

describe('handleAutoUpdate', () => {
  let mockSpawn: jest.Mock;
  let mockProcess: Partial<ChildProcess>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockProcess = {
      on: jest.fn(),
      unref: jest.fn(),
      stderr: {
        on: jest.fn(),
      } as any,
      pid: 12345,
    };

    mockSpawn = jest.fn(() => mockProcess);
    mockUpdateEventEmitter.emit = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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

    // Simulate successful close
    const closeHandler = (mockProcess.on as jest.Mock).mock.calls.find(
      (call) => call[0] === 'close',
    )[1];
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

    // Simulate failed close
    const closeHandler = (mockProcess.on as jest.Mock).mock.calls.find(
      (call) => call[0] === 'close',
    )[1];
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

    // Simulate process error
    const errorHandler = (mockProcess.on as jest.Mock).mock.calls.find(
      (call) => call[0] === 'error',
    )[1];
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
});

describe('setUpdateHandler', () => {
  let realEmitter: EventEmitter;
  let onUpdateReceived: jest.Mock;
  let onUpdateSuccess: jest.Mock;
  let onUpdateFailed: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Create a real EventEmitter for testing
    realEmitter = new EventEmitter();
    mockUpdateEventEmitter.on = realEmitter.on.bind(realEmitter) as any;
    mockUpdateEventEmitter.off = realEmitter.off.bind(realEmitter) as any;
    mockUpdateEventEmitter.emit = realEmitter.emit.bind(realEmitter) as any;

    onUpdateReceived = jest.fn();
    onUpdateSuccess = jest.fn();
    onUpdateFailed = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
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
    jest.advanceTimersByTime(60000);

    expect(onUpdateReceived).toHaveBeenCalledTimes(2);
    expect(onUpdateReceived).toHaveBeenLastCalledWith({ message: 'Update available' });
  });

  it('should not repeat onUpdateReceived if update succeeds', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    realEmitter.emit('update-success', { message: 'Update complete' });

    // Fast-forward 60 seconds
    jest.advanceTimersByTime(60000);

    // Should not be called again
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);
  });

  it('should not repeat onUpdateReceived if update fails', () => {
    setUpdateHandler(onUpdateReceived, onUpdateSuccess, onUpdateFailed);

    realEmitter.emit('update-received', { message: 'Update available' });
    expect(onUpdateReceived).toHaveBeenCalledTimes(1);

    realEmitter.emit('update-failed', { message: 'Update failed' });

    // Fast-forward 60 seconds
    jest.advanceTimersByTime(60000);

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
