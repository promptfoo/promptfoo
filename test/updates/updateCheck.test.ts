import { beforeEach, describe, expect, it, type MockedFunction, vi } from 'vitest';

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('semver', () => ({
  default: {
    gt: vi.fn(),
  },
}));

vi.mock('../../src/version', () => ({
  VERSION: '1.0.0',
}));

import semver from 'semver';
import { checkForUpdates } from '../../src/updates/updateCheck';
import { fetchWithTimeout } from '../../src/util/fetch/index';

const mockFetchWithTimeout = fetchWithTimeout as MockedFunction<typeof fetchWithTimeout>;
const mockSemverGt = semver.gt as MockedFunction<typeof semver.gt>;

describe('checkForUpdates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchWithTimeout.mockReset();
    mockSemverGt.mockReset();
    vi.unstubAllEnvs();
  });

  it('should check for updates when the evaluated application uses development mode', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ latestVersion: '1.0.0' }),
    } as any);
    mockSemverGt.mockReturnValue(false);

    const result = await checkForUpdates();

    expect(result).toBeNull();
    expect(mockFetchWithTimeout).toHaveBeenCalled();
  });

  it('should return null without a request when update checks are disabled', async () => {
    vi.stubEnv('PROMPTFOO_DISABLE_UPDATE', 'true');

    await expect(checkForUpdates({ throwOnError: true })).resolves.toBeNull();

    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
  });

  it('should perform an explicit update request when update notifications are disabled', async () => {
    vi.stubEnv('PROMPTFOO_DISABLE_UPDATE', 'true');
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ latestVersion: '1.0.0' }),
    } as any);
    mockSemverGt.mockReturnValue(false);

    await expect(
      checkForUpdates({ throwOnError: true, ignoreDisableUpdate: true }),
    ).resolves.toBeNull();

    expect(mockFetchWithTimeout).toHaveBeenCalled();
  });

  it('should return update info when update is available', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as any);

    mockSemverGt.mockReturnValue(true);

    const result = await checkForUpdates();

    expect(result).toEqual({
      message: 'Promptfoo update available! 1.0.0 → 1.1.0',
      update: {
        current: '1.0.0',
        latest: '1.1.0',
        name: 'promptfoo',
      },
    });

    expect(mockFetchWithTimeout).toHaveBeenCalledWith(
      'https://api.promptfoo.dev/api/latestVersion',
      { headers: { 'x-promptfoo-silent': 'true' } },
      10000,
    );
  });

  it('should return null when no update is available', async () => {
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: async () => ({ latestVersion: '1.0.0' }),
    } as any);

    mockSemverGt.mockReturnValue(false);

    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should throw on network error when requested', async () => {
    mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

    await expect(checkForUpdates({ throwOnError: true })).rejects.toThrow('Network error');
  });
});
