import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../src/version', () => ({
  VERSION: '0.11.0',
  POSTHOG_KEY: '',
  ENGINES: { node: '>=20.0.0' },
}));

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
  beforeEach(() => {
    // Reset fetchWithTimeout to clear any queued mockResolvedValueOnce from other tests
    vi.mocked(fetchWithTimeout).mockReset();
    // Clear env var that other tests may have set
    delete process.env.PROMPTFOO_DISABLE_UPDATE;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(console.log).mockRestore();
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
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.PROMPTFOO_DISABLE_UPDATE;
  });

  afterEach(() => {
    vi.mocked(console.log).mockRestore();
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
    process.env.PROMPTFOO_DISABLE_UPDATE = 'true';

    vi.mocked(fetchWithTimeout).mockReset();

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
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
