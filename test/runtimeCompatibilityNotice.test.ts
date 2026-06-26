import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/envars', () => ({
  getEnvBool: vi.fn(),
  getEnvString: vi.fn(),
  isNonInteractive: vi.fn(),
}));
vi.mock('../src/globalConfig/runtimeNoticeState', () => ({
  readRuntimeNoticeLastShownAt: vi.fn(),
  withRuntimeNoticeStateLock: vi.fn(),
  writeRuntimeNoticeLastShownAt: vi.fn(),
}));
vi.mock('../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

import { getEnvBool, getEnvString, isNonInteractive } from '../src/envars';
import {
  readRuntimeNoticeLastShownAt,
  withRuntimeNoticeStateLock,
  writeRuntimeNoticeLastShownAt,
} from '../src/globalConfig/runtimeNoticeState';
import { getRuntimeCompatibilityNotice } from '../src/runtimeCompatibility';
import {
  formatRuntimeCompatibilityNotice,
  maybeWarnAboutRuntime,
  runStartupRuntimeAndUpdateChecks,
} from '../src/runtimeCompatibilityNotice';
import telemetry from '../src/telemetry';

describe('runtime compatibility CLI notice', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(isNonInteractive).mockReturnValue(false);
    vi.mocked(readRuntimeNoticeLastShownAt).mockReturnValue(undefined);
    vi.mocked(withRuntimeNoticeStateLock).mockImplementation((_noticeId, callback) => callback());
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    vi.resetAllMocks();
  });

  it('shows and persists the full notice for an interactive Node.js 20 run', () => {
    const now = new Date('2026-06-22T12:00:00.000Z');

    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2', now, nonInteractive: false })).toBe(
      true,
    );

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('support ends July 30, 2026'),
    );
    expect(writeRuntimeNoticeLastShownAt).toHaveBeenCalledWith(
      'node20-removal-2026-07-30',
      now.toISOString(),
    );
    expect(telemetry.record).toHaveBeenCalledWith(
      'feature_used',
      expect.objectContaining({
        action: 'shown',
        noticeId: 'node20-removal-2026-07-30',
        surface: 'cli_startup',
        variant: 'full',
      }),
    );
  });

  it('does not repeat the notice before the reminder interval', () => {
    vi.mocked(readRuntimeNoticeLastShownAt).mockReturnValue('2026-06-20T12:00:00.000Z');

    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
      }),
    ).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
    expect(writeRuntimeNoticeLastShownAt).not.toHaveBeenCalled();
  });

  it('does not duplicate a reminder claimed by another process', () => {
    vi.mocked(withRuntimeNoticeStateLock).mockReturnValue(undefined);

    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2' })).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
    expect(writeRuntimeNoticeLastShownAt).not.toHaveBeenCalled();
  });

  it('fails open when the reminder lock cannot be created', () => {
    vi.mocked(withRuntimeNoticeStateLock).mockImplementation(() => {
      throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    });

    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2' })).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(writeRuntimeNoticeLastShownAt).not.toHaveBeenCalled();
  });

  it('fails open for malformed and future persisted timestamps', () => {
    const now = new Date('2026-06-22T12:00:00.000Z');
    vi.mocked(readRuntimeNoticeLastShownAt)
      .mockReturnValueOnce('invalid')
      .mockReturnValueOnce('2099-01-01T00:00:00.000Z');

    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2', now })).toBe(true);
    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2', now })).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('fails open when reminder state cannot be read', () => {
    vi.mocked(readRuntimeNoticeLastShownAt).mockImplementation(() => {
      throw new Error('Unreadable state');
    });

    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2' })).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps a displayed notice nonfatal when persistence fails', () => {
    vi.mocked(writeRuntimeNoticeLastShownAt).mockImplementation(() => {
      throw new Error('Read-only config');
    });

    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
      }),
    ).toBe(true);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('uses compact copy in non-interactive environments', () => {
    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
        nonInteractive: true,
      }),
    ).toBe(true);

    const message = vi.mocked(console.warn).mock.calls[0][0] as string;
    expect(message).not.toContain('\n');
    expect(message).toContain('Upgrade to Node.js 22.22.0 or newer');
  });

  it('uses Docker pull guidance only for official-image CLI runs', () => {
    vi.mocked(getEnvBool).mockImplementation((name) => name === 'PROMPTFOO_OFFICIAL_DOCKER_IMAGE');

    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
        nonInteractive: true,
      }),
    ).toBe(true);

    const message = vi.mocked(console.warn).mock.calls[0][0] as string;
    expect(message).toContain('Pull the latest Promptfoo Docker image');
    expect(message).toContain(
      'If this is a derived image, update its Promptfoo base and rebuild it',
    );
    expect(message).not.toContain('Upgrade to Node.js');
  });

  it('keeps Node.js upgrade guidance for generic self-hosted CLI runs', () => {
    vi.mocked(getEnvBool).mockImplementation((name) => name === 'PROMPTFOO_SELF_HOSTED');

    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
        nonInteractive: true,
      }),
    ).toBe(true);

    const message = vi.mocked(console.warn).mock.calls[0][0] as string;
    expect(message).toContain('Upgrade to Node.js 22.22.0 or newer');
    expect(message).not.toContain('Docker image');
  });

  it('uses rebuild guidance for a custom-container CLI run', () => {
    vi.mocked(getEnvBool).mockImplementation((name) => name === 'PROMPTFOO_RUNNING_IN_DOCKER');

    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
        nonInteractive: true,
      }),
    ).toBe(true);

    const message = vi.mocked(console.warn).mock.calls[0][0] as string;
    expect(message).toContain('Update the Promptfoo source, dependency, or parent image');
    expect(message).toContain("this custom image's Node.js base to 24 LTS");
    expect(message).not.toContain('docker pull');
    expect(message).not.toContain('npx promptfoo');
  });

  it('can be disabled explicitly and stays silent on newer Node.js versions', () => {
    vi.mocked(getEnvBool).mockReturnValue(true);
    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2' })).toBe(false);

    vi.mocked(getEnvBool).mockReturnValue(false);
    expect(maybeWarnAboutRuntime({ currentVersion: 'v24.0.0' })).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('does not record a notice when warning-level output is suppressed', () => {
    vi.mocked(getEnvString).mockReturnValue('error');

    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2' })).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
    expect(telemetry.record).not.toHaveBeenCalled();
  });

  it('formats a direct, actionable notice', () => {
    const notice = getRuntimeCompatibilityNotice('v20.20.2', {
      isBun: false,
      isDeno: false,
    });
    expect(notice).not.toBeNull();
    expect(formatRuntimeCompatibilityNotice(notice!, false)).toContain(
      'Upgrade guide: https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
    );
    expect(
      formatRuntimeCompatibilityNotice(notice!, true, new Date('2026-08-01T00:00:00.000Z')),
    ).toContain('support in promptfoo ended July 30, 2026');
  });
});

describe('runStartupRuntimeAndUpdateChecks', () => {
  it('runs the update check after showing the runtime notice', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(true);
    const warnAboutRuntime = vi.fn(() => true);

    await runStartupRuntimeAndUpdateChecks({
      checkForUpdates,
      warnAboutRuntime,
      runtimeNoticeApplies: () => true,
      runtimeWarningsDisabled: () => false,
    });

    expect(warnAboutRuntime).toHaveBeenCalledTimes(1);
    expect(checkForUpdates).toHaveBeenCalledWith({ suppressRuntimeBlockedWarning: true });
  });

  it('allows update guidance when runtime notice output is disabled', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(true);

    await runStartupRuntimeAndUpdateChecks({
      checkForUpdates,
      warnAboutRuntime: () => false,
      runtimeNoticeApplies: () => true,
      runtimeWarningsDisabled: () => true,
    });

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
    expect(checkForUpdates).toHaveBeenCalledWith({ suppressRuntimeBlockedWarning: false });
  });

  it('does not let post-cutoff update guidance bypass a cadence-suppressed notice', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(true);

    await runStartupRuntimeAndUpdateChecks({
      checkForUpdates,
      warnAboutRuntime: () => false,
      runtimeNoticeApplies: () => true,
      runtimeWarningsDisabled: () => false,
    });

    expect(checkForUpdates).toHaveBeenCalledWith({ suppressRuntimeBlockedWarning: true });
  });

  it('runs the update check without suppression when no runtime notice applies', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(false);

    await runStartupRuntimeAndUpdateChecks({
      checkForUpdates,
      warnAboutRuntime: () => false,
      runtimeNoticeApplies: () => false,
    });

    expect(checkForUpdates).toHaveBeenCalledWith({ suppressRuntimeBlockedWarning: false });
  });

  it('defaults to the real runtime-notice check when runtimeNoticeApplies is not injected', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(true);

    // Exercise the default runtimeNoticeApplies (getRuntimeCompatibilityNotice).
    await runStartupRuntimeAndUpdateChecks({ checkForUpdates, warnAboutRuntime: () => true });

    expect(checkForUpdates).toHaveBeenCalledWith({
      suppressRuntimeBlockedWarning: process.versions.node.startsWith('20.'),
    });
  });
});
