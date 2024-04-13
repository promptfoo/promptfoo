import { getLatestVersion, checkForUpdates } from '../src/updates';
import { fetchWithTimeout } from '../src/fetch';
import packageJson from '../package.json';

jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../package.json', () => ({
  version: '0.11.0',
}));

describe('getLatestVersion', () => {
  it('should return the latest version of the package', async () => {
    (fetchWithTimeout as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    });

    const latestVersion = await getLatestVersion();
    expect(latestVersion).toBe('1.1.0');
  });

  it('should throw an error if the response is not ok', async () => {
    (fetchWithTimeout as jest.Mock).mockResolvedValueOnce({
      ok: false,
    });

    await expect(getLatestVersion()).rejects.toThrow(
      'Failed to fetch package information for promptfoo',
    );
  });
});

describe('checkForUpdates', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    (console.log as jest.Mock).mockRestore();
  });

  it('should log an update message if a newer version is available - minor ver', async () => {
    (fetchWithTimeout as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    });

    const result = await checkForUpdates();
    expect(result).toBeTruthy();
  });

  it('should log an update message if a newer version is available - major ver', async () => {
    (fetchWithTimeout as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    });

    const result = await checkForUpdates();
    expect(result).toBeTruthy();
  });

  it('should not log an update message if the current version is up to date', async () => {
    (fetchWithTimeout as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: packageJson.version }),
    });

    const result = await checkForUpdates();
    expect(result).toBeFalsy();
  });
});
