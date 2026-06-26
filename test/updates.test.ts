import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

// Create mock for exec - using vi.hoisted to ensure it's available in vi.mock factory
const { mockExecAsync } = vi.hoisted(() => {
  const mockExecAsync = vi.fn();
  return { mockExecAsync };
});

// Mock child_process.exec with custom promisify symbol
vi.mock('child_process', async () => {
  const actual = await vi.importActual<typeof import('child_process')>('child_process');
  const mockExec = Object.assign(vi.fn(), {
    [Symbol.for('nodejs.util.promisify.custom')]: mockExecAsync,
  });
  return {
    ...actual,
    exec: mockExec,
  };
});

vi.mock('../src/util/fetch/index.ts', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../src/envars', () => ({
  getEnvBool: (key: string) => {
    const value = process.env[key]?.toLowerCase();
    return value === '1' || value === 'true';
  },
  getEnvInt: (key: string, defaultValue?: number) => {
    const value = process.env[key];
    return value === undefined ? defaultValue : Number.parseInt(value, 10);
  },
  getEnvString: (key: string, defaultValue?: string) => process.env[key] ?? defaultValue,
}));

vi.mock('../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../src/version', () => ({
  VERSION: '0.11.0',
  POSTHOG_KEY: '',
  ENGINES: { node: '>=20.0.0' },
}));

import logger from '../src/logger';
import {
  checkForUpdates,
  checkModelAuditUpdates,
  getLatestVersion,
  getModelAuditCurrentVersion,
  getModelAuditLatestVersion,
} from '../src/updates';
import { fetchWithTimeout } from '../src/util/fetch/index';
import { VERSION } from '../src/version';

beforeEach(() => {
  vi.mocked(fetchWithTimeout).mockReset();
  mockExecAsync.mockReset();
  mockExecAsync.mockResolvedValue({
    stdout: 'modelaudit, version 0.0.0',
    stderr: '',
  });
});

describe('getLatestVersion', () => {
  it('should return the latest version of the package', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const latestVersion = await getLatestVersion();
    expect(latestVersion).toBe('1.1.0');
  });

  it('should throw an error if the response is not ok', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: false,
    } as never);

    await expect(getLatestVersion()).rejects.toThrow(
      'Failed to fetch package information for promptfoo',
    );
  });
});

describe('checkForUpdates', () => {
  let loggerInfoSpy: ReturnType<typeof vi.spyOn>;
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let restoreEnv: () => void;

  beforeEach(() => {
    // Reset fetchWithTimeout to clear any queued mockResolvedValueOnce from other tests
    vi.mocked(fetchWithTimeout).mockReset();
    restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: undefined });
    loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerInfoSpy.mockRestore();
    loggerWarnSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    restoreEnv();
  });

  it('should skip the CLI update check when PROMPTFOO_DISABLE_UPDATE is set', async () => {
    const restoreDisableUpdate = mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: 'true' });
    try {
      expect(await checkForUpdates()).toBe(false);
      expect(fetchWithTimeout).not.toHaveBeenCalled();
      expect(loggerInfoSpy).not.toHaveBeenCalled();
      expect(loggerWarnSpy).not.toHaveBeenCalled();
    } finally {
      restoreDisableUpdate();
    }
  });

  it('should log an update message if a newer version is available - minor ver', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const result = await checkForUpdates();
    expect(result).toBeTruthy();
  });

  it('should log an update message if a newer version is available - major ver', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const result = await checkForUpdates();
    expect(result).toBeTruthy();
  });

  it('should not log an update message if the current version is up to date', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: VERSION }),
    } as never);

    const result = await checkForUpdates();
    expect(result).toBeFalsy();
  });

  it('should tell Node.js 20 users to upgrade Node before installing latest after cutoff', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const result = await checkForUpdates({
      currentNodeVersion: 'v20.20.2',
      now: new Date('2026-07-30T00:00:00.000Z'),
    });

    expect(result).toBe(true);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Upgrade to Node.js 22.22.0 or newer'),
    );
    expect(loggerInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should keep normal update guidance for Node.js 20 before cutoff', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const result = await checkForUpdates({
      currentNodeVersion: 'v20.20.2',
      now: new Date('2026-07-29T23:59:59.999Z'),
    });

    expect(result).toBe(true);
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringContaining('npx promptfoo@latest'));
    expect(loggerWarnSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('should preserve Docker pull guidance before and after the Node.js 20 cutoff', async () => {
    const restoreDocker = mockProcessEnv({ PROMPTFOO_RUNNING_IN_DOCKER: 'true' });
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ latestVersion: '1.1.0' }),
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ latestVersion: '1.1.0' }),
      } as never);

    try {
      await checkForUpdates({
        currentNodeVersion: 'v20.20.2',
        now: new Date('2026-07-29T23:59:59.999Z'),
      });
      await checkForUpdates({
        currentNodeVersion: 'v20.20.2',
        now: new Date('2026-07-30T00:00:00.000Z'),
      });
    } finally {
      restoreDocker();
    }

    expect(loggerInfoSpy).toHaveBeenCalledTimes(2);
    expect(loggerInfoSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('docker pull ghcr.io/promptfoo/promptfoo:latest'),
    );
    expect(loggerInfoSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('docker pull ghcr.io/promptfoo/promptfoo:latest'),
    );
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('should keep package update safeguards in generic self-hosted mode', async () => {
    const restoreSelfHosted = mockProcessEnv({
      PROMPTFOO_RUNNING_IN_DOCKER: undefined,
      PROMPTFOO_SELF_HOSTED: 'true',
    });
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    try {
      await checkForUpdates({
        currentNodeVersion: 'v20.20.2',
        now: new Date('2026-07-30T00:00:00.000Z'),
      });
    } finally {
      restoreSelfHosted();
    }

    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Upgrade to Node.js 22.22.0 or newer'),
    );
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it('should let the runtime campaign suppress duplicate post-cutoff guidance', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const result = await checkForUpdates({
      currentNodeVersion: 'v20.20.2',
      now: new Date('2026-07-30T00:00:00.000Z'),
      suppressRuntimeBlockedWarning: true,
    });

    expect(result).toBe(true);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(loggerInfoSpy).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});

describe('getModelAuditLatestVersion', () => {
  it('should return the latest version from PyPI', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const version = await getModelAuditLatestVersion();
    expect(version).toBe('0.1.7');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://pypi.org/pypi/modelaudit/json',
      { headers: { 'x-promptfoo-silent': 'true' } },
      10000,
    );
  });

  it('should return null if PyPI request fails', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: false,
    } as never);

    const version = await getModelAuditLatestVersion();
    expect(version).toBeNull();
  });

  it('should return null if fetch throws', async () => {
    vi.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error('Network error'));

    const version = await getModelAuditLatestVersion();
    expect(version).toBeNull();
  });
});

describe('getModelAuditCurrentVersion', () => {
  it('should return the current version from modelaudit --version', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'modelaudit, version 0.1.5',
      stderr: '',
    });

    const version = await getModelAuditCurrentVersion();
    expect(version).toBe('0.1.5');
  });

  it('should return null if modelaudit --version fails', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('Command failed'));

    const version = await getModelAuditCurrentVersion();
    expect(version).toBeNull();
  });

  it('should return null if version pattern not found', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'some invalid output',
      stderr: '',
    });

    const version = await getModelAuditCurrentVersion();
    expect(version).toBeNull();
  });
});

describe('checkModelAuditUpdates', () => {
  let loggerInfoSpy: ReturnType<typeof vi.spyOn>;
  let restoreEnv: () => void;

  beforeEach(() => {
    loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: undefined });
  });

  afterEach(() => {
    loggerInfoSpy.mockRestore();
    restoreEnv();
  });

  it('should return true and log message when update is available', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'modelaudit, version 0.1.5',
      stderr: '',
    });

    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeTruthy();
  });

  it('should return false when versions are equal', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'modelaudit, version 0.1.7',
      stderr: '',
    });

    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });

  it('should return false when current version is newer', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'modelaudit, version 0.2.0',
      stderr: '',
    });

    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });

  it('should return false when PROMPTFOO_DISABLE_UPDATE is set', async () => {
    const restoreDisableUpdate = mockProcessEnv({ PROMPTFOO_DISABLE_UPDATE: 'true' });
    try {
      vi.mocked(fetchWithTimeout).mockReset();

      const result = await checkModelAuditUpdates();
      expect(result).toBeFalsy();
      expect(fetchWithTimeout).not.toHaveBeenCalled();
    } finally {
      restoreDisableUpdate();
    }
  });

  it('should return false when current version cannot be determined', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('Command failed'));

    vi.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });

  it('should return false when latest version cannot be determined', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'modelaudit, version 0.1.5',
      stderr: '',
    });

    vi.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error('Network error'));

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });
});
