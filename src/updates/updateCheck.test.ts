jest.mock('../util/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('semver', () => ({
  gt: jest.fn(),
}));

// Mock package.json import
jest.mock('../../package.json', () => ({
  name: 'promptfoo',
  version: '1.0.0',
}));

import { checkForUpdates } from './updateCheck';
import { fetchWithTimeout } from '../util/fetch';
import semver from 'semver';

const mockFetchWithTimeout = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;
const mockSemverGt = semver.gt as jest.MockedFunction<typeof semver.gt>;

describe('checkForUpdates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.NODE_ENV;
  });

  it('should return null in development mode', async () => {
    process.env.NODE_ENV = 'development';
    const result = await checkForUpdates();
    expect(result).toBeNull();
    expect(mockFetchWithTimeout).not.toHaveBeenCalled();
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
      {},
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
});
