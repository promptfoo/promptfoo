import { getUserEmail } from '../src/globalConfig/accounts';
import { cloudConfig } from '../src/globalConfig/cloud';
import logger from '../src/logger';
import type Eval from '../src/models/eval';
import { stripAuthFromUrl, createShareableUrl } from '../src/share';

jest.mock('../src/logger');
jest.mock('../src/globalConfig/cloud');
jest.mock('../src/fetch', () => ({
  fetchWithProxy: jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({ id: 'mock-eval-id' }),
  }),
}));

jest.mock('../src/globalConfig/accounts', () => ({
  getUserEmail: jest.fn(),
  setUserEmail: jest.fn(),
}));

describe('stripAuthFromUrl', () => {
  it('removes username and password from URL', () => {
    const input = 'https://user:pass@example.com/path?query=value#hash';
    const expected = 'https://example.com/path?query=value#hash';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('handles URLs without auth info', () => {
    const input = 'https://example.com/path?query=value#hash';
    expect(stripAuthFromUrl(input)).toBe(input);
  });

  it('handles URLs with only username', () => {
    const input = 'https://user@example.com/path';
    const expected = 'https://example.com/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('handles URLs with special characters in auth', () => {
    const input = 'https://user%40:p@ss@example.com/path';
    const expected = 'https://example.com/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });

  it('returns original string for invalid URLs', () => {
    const input = 'not a valid url';
    expect(stripAuthFromUrl(input)).toBe(input);
  });

  it('handles URLs with IP addresses', () => {
    const input = 'http://user:pass@192.168.1.1:8080/path';
    const expected = 'http://192.168.1.1:8080/path';
    expect(stripAuthFromUrl(input)).toBe(expected);
  });
});

describe('createShareableUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates correct URL for cloud config and updates author', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    jest.mocked(getUserEmail).mockReturnValue('logged-in@example.com');

    const mockEval: Partial<Eval> = {
      config: {},
      author: 'original@example.com',
      useOldResults: jest.fn().mockReturnValue(false),
      loadResults: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const result = await createShareableUrl(mockEval as Eval);

    expect(result).toBe('https://app.example.com/eval/mock-eval-id');
    expect(mockEval.author).toBe('logged-in@example.com');
    expect(mockEval.save).toHaveBeenCalledWith();
  });

  it('throws error if cloud config enabled but no user email', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(getUserEmail).mockReturnValue(null);

    const mockEval: Partial<Eval> = {
      config: {},
      useOldResults: jest.fn().mockReturnValue(false),
      loadResults: jest.fn().mockResolvedValue(undefined),
    };

    await expect(createShareableUrl(mockEval as Eval)).rejects.toThrow('User email is not set');
  });

  it('logs warning when changing author in cloud mode', async () => {
    jest.mocked(cloudConfig.isEnabled).mockReturnValue(true);
    jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');
    jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    jest.mocked(cloudConfig.getApiKey).mockReturnValue('mock-api-key');
    jest.mocked(getUserEmail).mockReturnValue('new@example.com');

    const mockEval: Partial<Eval> = {
      config: {},
      author: 'original@example.com',
      useOldResults: jest.fn().mockReturnValue(false),
      loadResults: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
    };

    await createShareableUrl(mockEval as Eval);

    expect(mockEval.author).toBe('new@example.com');
    expect(jest.mocked(logger.warn)).toHaveBeenCalledWith(
      'Warning: Changing eval author from original@example.com to logged-in user new@example.com',
    );
  });
});
