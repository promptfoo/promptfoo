import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import logger from '../../src/logger';
import {
  AUTO_UPDATE_TIMEOUT_MS,
  handleAutoUpdate,
  isAutoUpdateEnabled,
  trackUpdateInterruptions,
} from '../../src/updates/handleAutoUpdate';
import { getInstallationInfo } from '../../src/updates/installationInfo';
import { runNpmUpdate } from '../../src/updates/updateCommandUtils';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/updates/installationInfo', () => ({ getInstallationInfo: vi.fn() }));
vi.mock('../../src/updates/updateCommandUtils', () => ({ runNpmUpdate: vi.fn() }));
vi.mock('../../src/logger', () => ({ default: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
const info = {
  message: 'Update available',
  update: { name: 'promptfoo', current: '1.0.0', latest: '1.2.3' },
};
const launchEnv = { PROMPTFOO_ENABLE_AUTO_UPDATE: '1' };
let restoreEnvironment: () => void;
beforeEach(() => {
  restoreEnvironment = mockProcessEnv({}, { clear: true });
  cliState.config = undefined;
  vi.mocked(getInstallationInfo)
    .mockReset()
    .mockReturnValue({ canUpdate: true, message: 'Global npm' });
  vi.mocked(runNpmUpdate).mockReset().mockResolvedValue('complete');
  vi.clearAllMocks();
});
afterEach(() => {
  restoreEnvironment();
  cliState.config = undefined;
  vi.restoreAllMocks();
});

describe('automatic update authorization', () => {
  it('requires launch opt-in even when a loaded project opts in', async () => {
    mockProcessEnv({ PROMPTFOO_ENABLE_AUTO_UPDATE: '1' });
    expect(isAutoUpdateEnabled({})).toBe(false);
    await handleAutoUpdate(info, '/workspace', {});
    expect(getInstallationInfo).not.toHaveBeenCalled();
  });

  it('keeps a launch disable veto when later configuration clears it', async () => {
    cliState.config = { env: { PROMPTFOO_DISABLE_UPDATE: '0' } as any };
    await handleAutoUpdate(info, '/workspace', { ...launchEnv, PROMPTFOO_DISABLE_UPDATE: '1' });
    expect(runNpmUpdate).not.toHaveBeenCalled();
  });

  it('allows later configuration to disable an opted-in update', async () => {
    cliState.config = { env: { PROMPTFOO_DISABLE_UPDATE: '1' } as any };
    await handleAutoUpdate(info, '/workspace', launchEnv);
    expect(runNpmUpdate).not.toHaveBeenCalled();
  });
});

describe('automatic update reporting', () => {
  it('uses the captured environment and waits for the pinned update', async () => {
    await handleAutoUpdate(info, '/workspace', launchEnv);
    expect(runNpmUpdate).toHaveBeenCalledWith(
      '1.2.3',
      launchEnv,
      '/workspace',
      AUTO_UPDATE_TIMEOUT_MS,
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('next command'));
  });
  it('reports manual instructions for unsupported installations', async () => {
    vi.mocked(getInstallationInfo).mockReturnValue({
      canUpdate: false,
      message: 'Use your package manager.',
    });
    await handleAutoUpdate(info, '/workspace', launchEnv);
    expect(runNpmUpdate).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Use your package manager.');
  });
  it('does not claim success while installation remains in progress', async () => {
    vi.mocked(runNpmUpdate).mockResolvedValue('background');
    await handleAutoUpdate(info, '/workspace', launchEnv);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('success is not yet known'));
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('next command'));
  });
  it('logs one failure without changing the completed command status', async () => {
    vi.mocked(runNpmUpdate).mockRejectedValue(new Error('fixture failure'));
    const exitCode = process.exitCode;
    await handleAutoUpdate(info, '/workspace', launchEnv);
    expect(logger.warn).toHaveBeenCalledOnce();
    expect(process.exitCode).toBe(exitCode);
  });
});

describe('interruption tracking', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    'preserves existing %s handlers and remembers handled interruptions',
    (signal) => {
      const originalListener = vi.fn();
      process.on(signal, originalListener);
      const tracker = trackUpdateInterruptions();
      const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
      try {
        process.emit(signal);
        expect(originalListener).toHaveBeenCalledOnce();
        expect(tracker.wasInterrupted()).toBe(true);
        expect(kill).not.toHaveBeenCalled();
      } finally {
        tracker.dispose();
        process.removeListener(signal, originalListener);
      }
    },
  );
  it('restores a default signal exit if no command handler exists', () => {
    const existing = process.rawListeners('SIGTERM');
    process.removeAllListeners('SIGTERM');
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const tracker = trackUpdateInterruptions();
    try {
      process.emit('SIGTERM');
      expect(tracker.wasInterrupted()).toBe(true);
      expect(process.listenerCount('SIGTERM')).toBe(0);
      expect(kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    } finally {
      tracker.dispose();
      for (const listener of existing) {
        process.on('SIGTERM', listener as () => void);
      }
    }
  });
});
