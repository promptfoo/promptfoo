let mockExecAsync: jest.Mock;

jest.mock('util', () => ({
  ...jest.requireActual('util'),
  promisify: jest.fn((fn) => {
    if (fn.name === 'exec') {
      // Return a function that will use mockExecAsync when called
      return (...args: any[]) => {
        if (!mockExecAsync) {
          mockExecAsync = jest.fn();
        }
        return mockExecAsync(...args);
      };
    }
    return jest.requireActual('util').promisify(fn);
  }),
}));

jest.mock('../src/fetch', () => ({
  fetchWithTimeout: jest.fn(),
}));

jest.mock('../package.json', () => ({
  version: '0.11.0',
}));

import packageJson from '../package.json';
import { fetchWithTimeout } from '../src/fetch';
import {
  checkForUpdates,
  checkModelAuditUpdates,
  getLatestVersion,
  getModelAuditCurrentVersion,
  getModelAuditLatestVersion,
} from '../src/updates';

beforeEach(() => {
  mockExecAsync = jest.fn();
});

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

describe('getModelAuditLatestVersion', () => {
  it('should return the latest version from PyPI', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const version = await getModelAuditLatestVersion();
    expect(version).toBe('0.1.7');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://pypi.org/pypi/modelaudit/json',
      {},
      1000,
    );
  });

  it('should return null if PyPI request fails', async () => {
    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: false,
    } as never);

    const version = await getModelAuditLatestVersion();
    expect(version).toBeNull();
  });

  it('should return null if fetch throws', async () => {
    jest.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error('Network error'));

    const version = await getModelAuditLatestVersion();
    expect(version).toBeNull();
  });
});

describe('getModelAuditCurrentVersion', () => {
  it('should return the current version from pip show', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'Name: modelaudit\nVersion: 0.1.5\nSummary: Model audit tool',
      stderr: '',
    });

    const version = await getModelAuditCurrentVersion();
    expect(version).toBe('0.1.5');
  });

  it('should return null if pip show fails', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('Command failed'));

    const version = await getModelAuditCurrentVersion();
    expect(version).toBeNull();
  });

  it('should return null if version pattern not found', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'Name: modelaudit\nSummary: Model audit tool',
      stderr: '',
    });

    const version = await getModelAuditCurrentVersion();
    expect(version).toBeNull();
  });
});

describe('checkModelAuditUpdates', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.PROMPTFOO_DISABLE_UPDATE;
  });

  afterEach(() => {
    jest.mocked(console.log).mockRestore();
    jest.clearAllMocks();
  });

  it('should return true and log message when update is available', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'Name: modelaudit\nVersion: 0.1.5\nSummary: Model audit tool',
      stderr: '',
    });

    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeTruthy();
  });

  it('should return false when versions are equal', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'Name: modelaudit\nVersion: 0.1.7\nSummary: Model audit tool',
      stderr: '',
    });

    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });

  it('should return false when current version is newer', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'Name: modelaudit\nVersion: 0.2.0\nSummary: Model audit tool',
      stderr: '',
    });

    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });

  it('should return false when PROMPTFOO_DISABLE_UPDATE is set', async () => {
    process.env.PROMPTFOO_DISABLE_UPDATE = 'true';

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('should return false when current version cannot be determined', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('Command failed'));

    jest.mocked(fetchWithTimeout).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ info: { version: '0.1.7' } }),
    } as never);

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });

  it('should return false when latest version cannot be determined', async () => {
    mockExecAsync.mockResolvedValueOnce({
      stdout: 'Name: modelaudit\nVersion: 0.1.5\nSummary: Model audit tool',
      stderr: '',
    });

    jest.mocked(fetchWithTimeout).mockRejectedValueOnce(new Error('Network error'));

    const result = await checkModelAuditUpdates();
    expect(result).toBeFalsy();
  });
});
