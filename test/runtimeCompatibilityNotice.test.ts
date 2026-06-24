import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/envars', () => ({
  getEnvBool: vi.fn(),
  getEnvString: vi.fn(),
  isNonInteractive: vi.fn(),
}));
vi.mock('../src/globalConfig/globalConfig', () => ({
  readGlobalConfig: vi.fn(),
  writeGlobalConfig: vi.fn(),
}));
vi.mock('../src/logger', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));
vi.mock('../src/telemetry', () => ({
  default: {
    record: vi.fn(),
  },
}));

import { getEnvBool, getEnvString, isNonInteractive } from '../src/envars';
import { readGlobalConfig, writeGlobalConfig } from '../src/globalConfig/globalConfig';
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
    vi.mocked(readGlobalConfig).mockReturnValue({ id: 'test-installation' });
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
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Node's built-in SQLite"));
    expect(writeGlobalConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        notices: {
          'node20-removal-2026-07-30': { lastShownAt: now.toISOString() },
        },
      }),
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

  it('merges notice state into a fresh global config snapshot', () => {
    const now = new Date('2026-06-22T12:00:00.000Z');
    vi.mocked(readGlobalConfig)
      .mockReturnValueOnce({ id: 'initial-installation' })
      .mockReturnValueOnce({
        id: 'current-installation',
        account: { email: 'current@example.com' },
        notices: {
          'another-notice': { lastShownAt: '2026-06-20T12:00:00.000Z' },
        },
      });

    expect(maybeWarnAboutRuntime({ currentVersion: 'v20.20.2', now })).toBe(true);

    expect(readGlobalConfig).toHaveBeenCalledTimes(2);
    expect(writeGlobalConfig).toHaveBeenCalledWith({
      id: 'current-installation',
      account: { email: 'current@example.com' },
      notices: {
        'another-notice': { lastShownAt: '2026-06-20T12:00:00.000Z' },
        'node20-removal-2026-07-30': { lastShownAt: now.toISOString() },
      },
    });
  });

  it('allows compatible update checks to continue when notice persistence fails', () => {
    vi.mocked(writeGlobalConfig).mockImplementation(() => {
      throw new Error('Read-only config');
    });

    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
      }),
    ).toBe(false);
    expect(console.warn).toHaveBeenCalled();
    expect(telemetry.record).toHaveBeenCalled();
  });

  it('does not repeat the notice before the reminder interval', () => {
    vi.mocked(readGlobalConfig).mockReturnValue({
      id: 'test-installation',
      notices: {
        'node20-removal-2026-07-30': { lastShownAt: '2026-06-20T12:00:00.000Z' },
      },
    });

    expect(
      maybeWarnAboutRuntime({
        currentVersion: 'v20.20.2',
        now: new Date('2026-06-22T12:00:00.000Z'),
      }),
    ).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
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
      now: new Date('2026-06-22T12:00:00.000Z'),
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
  it('skips the update check when the runtime reminder was shown', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(true);

    await runStartupRuntimeAndUpdateChecks({
      checkForUpdates,
      warnAboutRuntime: () => true,
      runtimeNoticeApplies: () => true,
    });

    expect(checkForUpdates).not.toHaveBeenCalled();
  });

  it('runs the update check and suppresses the duplicate runtime warning when a notice applies', async () => {
    const checkForUpdates = vi.fn().mockResolvedValue(true);

    await runStartupRuntimeAndUpdateChecks({
      checkForUpdates,
      warnAboutRuntime: () => false,
      runtimeNoticeApplies: () => true,
    });

    expect(checkForUpdates).toHaveBeenCalledTimes(1);
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

    // Exercise the default runtimeNoticeApplies (getRuntimeCompatibilityNotice). warnAboutRuntime
    // is injected so the outcome is deterministic regardless of the host Node.js version.
    await runStartupRuntimeAndUpdateChecks({ checkForUpdates, warnAboutRuntime: () => true });

    expect(checkForUpdates).not.toHaveBeenCalled();
  });
});
