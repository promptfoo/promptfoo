jest.mock('update-notifier', () => {
  const mockFetchInfo = jest.fn();
  return jest.fn(() => ({
    fetchInfo: mockFetchInfo,
  }));
});

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

jest.mock('semver', () => ({
  gt: jest.fn(),
}));

import { checkForUpdates } from './updateCheck';
import updateNotifier from 'update-notifier';
import { readFileSync } from 'fs';
import semver from 'semver';

const mockUpdateNotifier = updateNotifier as jest.MockedFunction<typeof updateNotifier>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
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
    expect(mockUpdateNotifier).not.toHaveBeenCalled();
  });

  it('should return null if package.json cannot be read', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return update info when update is available', async () => {
    const mockFetchInfo = jest.fn();
    mockUpdateNotifier.mockReturnValue({
      fetchInfo: mockFetchInfo,
    } as any);

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'promptfoo',
        version: '1.0.0',
      }),
    );

    const mockUpdateInfo = {
      current: '1.0.0',
      latest: '1.1.0',
    };

    mockFetchInfo.mockResolvedValue(mockUpdateInfo);
    mockSemverGt.mockReturnValue(true);

    const result = await checkForUpdates();

    expect(result).toEqual({
      message: 'Promptfoo update available! 1.0.0 → 1.1.0',
      update: mockUpdateInfo,
    });

    expect(mockUpdateNotifier).toHaveBeenCalledWith({
      pkg: {
        name: 'promptfoo',
        version: '1.0.0',
      },
      updateCheckInterval: 0,
      shouldNotifyInNpmScript: true,
    });
  });

  it('should return null when no update is available', async () => {
    const mockFetchInfo = jest.fn();
    mockUpdateNotifier.mockReturnValue({
      fetchInfo: mockFetchInfo,
    } as any);

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'promptfoo',
        version: '1.0.0',
      }),
    );

    const mockUpdateInfo = {
      current: '1.0.0',
      latest: '1.0.0',
    };

    mockFetchInfo.mockResolvedValue(mockUpdateInfo);
    mockSemverGt.mockReturnValue(false);

    const result = await checkForUpdates();
    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    const mockFetchInfo = jest.fn();
    mockUpdateNotifier.mockReturnValue({
      fetchInfo: mockFetchInfo,
    } as any);

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        name: 'promptfoo',
        version: '1.0.0',
      }),
    );

    mockFetchInfo.mockRejectedValue(new Error('Network error'));

    const result = await checkForUpdates();
    expect(result).toBeNull();
  });
});
