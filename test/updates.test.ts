import packageJson from '../package.json';
import { fetchWithTimeout } from '../src/fetch';
import { getLatestVersion, checkForUpdates } from '../src/updates';

jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../package.json', () => ({
  version: '0.11.0',
}));

describe('getLatestVersion', () => {
  it('should return the latest version of the package', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const latestVersion = await getLatestVersion();
    expect(latestVersion).toBe('1.1.0');
  });

  it('should throw an error if the response is not ok', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: false,
    } as never);

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
    jest.mocked(console.log).mockRestore();
  });

  it('should log an update message if a newer version is available - minor ver', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const result = await checkForUpdates();
    expect(result).toBeTruthy();
  });

  it('should log an update message if a newer version is available - major ver', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: '1.1.0' }),
    } as never);

    const result = await checkForUpdates();
    expect(result).toBeTruthy();
  });

  it('should not log an update message if the current version is up to date', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ latestVersion: packageJson.version }),
    } as never);

    const result = await checkForUpdates();
    expect(result).toBeFalsy();
  });
});
