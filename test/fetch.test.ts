import fs from 'fs';
import { getEnvString, getEnvBool } from '../src/envars';
import { fetchWithProxy } from '../src/fetch';

// Mock environment variables
jest.mock('../src/envars', () => ({
  getEnvString: jest.fn(),
  getEnvBool: jest.fn(),
}));

// Mock fs
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

jest.mock('../src/util/time', () => ({
  sleep: jest.fn(),
}));

describe('fetchWithProxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should use custom CA certificate when PROMPTFOO_CA_CERT_PATH is set', async () => {
    const mockCertPath = '/path/to/cert.pem';
    const mockCertContent = 'mock-cert-content';

    (jest.mocked(getEnvString)).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {return mockCertPath;}
      return undefined;
    });
    (jest.mocked(getEnvBool)).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {return false;}
      return undefined;
    });
    (jest.mocked(fs.readFileSync)).mockReturnValue(mockCertContent);

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    expect(fs.readFileSync).toHaveBeenCalledWith(mockCertPath);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        agent: expect.objectContaining({
          options: expect.objectContaining({
            ca: mockCertContent,
            rejectUnauthorized: true,
          }),
        }),
      }),
    );
  });

  it('should handle missing CA certificate file gracefully', async () => {
    const mockCertPath = '/path/to/nonexistent.pem';

    (jest.mocked(getEnvString)).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_CA_CERT_PATH') {return mockCertPath;}
      return undefined;
    });
    (jest.mocked(fs.readFileSync)).mockImplementation(() => {
      throw new Error('File not found');
    });

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    expect(fs.readFileSync).toHaveBeenCalledWith(mockCertPath);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        agent: expect.objectContaining({
          options: expect.objectContaining({
            rejectUnauthorized: true,
          }),
        }),
      }),
    );
  });

  it('should disable SSL verification when PROMPTFOO_INSECURE_SSL is true', async () => {
    (jest.mocked(getEnvString)).mockReturnValue(undefined);
    (jest.mocked(getEnvBool)).mockImplementation((key: string) => {
      if (key === 'PROMPTFOO_INSECURE_SSL') {return true;}
      return undefined;
    });

    const mockFetch = jest.fn().mockResolvedValue(new Response());
    global.fetch = mockFetch;

    await fetchWithProxy('https://example.com');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        agent: expect.objectContaining({
          options: expect.objectContaining({
            rejectUnauthorized: false,
          }),
        }),
      }),
    );
  });
});
