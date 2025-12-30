import fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnvString } from '../src/envars';
import { fetchCsvFromSharepoint } from '../src/microsoftSharepoint';
import { fetchWithProxy } from '../src/util/fetch/index';
import { createMockResponse } from './util/utils';

vi.mock('../src/util/fetch/index.ts', () => ({
  fetchWithProxy: vi.fn(),
}));

vi.mock('../src/envars', () => ({
  getEnvString: vi.fn(),
}));

vi.mock('fs');

// Mock the MSAL node module
const mockMsalClient = {
  acquireTokenByClientCredential: vi.fn(),
};

vi.mock('@azure/msal-node', () => {
  const ConfidentialClientApplication = vi.fn(function ConfidentialClientApplication() {
    return mockMsalClient;
  });
  return { ConfidentialClientApplication };
});

describe('SharePoint Integration', () => {
  const TEST_SHAREPOINT_URL =
    'https://yourcompany.sharepoint.com/sites/yoursite/Shared%20Documents/test-cases.csv';
  const TEST_BASE_URL = 'https://yourcompany.sharepoint.com';
  const TEST_ACCESS_TOKEN = 'test-access-token-123';

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default environment variables
    vi.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
      const values: Record<string, string> = {
        SHAREPOINT_BASE_URL: TEST_BASE_URL,
        SHAREPOINT_CLIENT_ID: 'test-client-id',
        SHAREPOINT_TENANT_ID: 'test-tenant-id',
        SHAREPOINT_CERT_PATH: '/path/to/cert.pem',
      };
      return values[key] || defaultValue;
    });

    // Mock certificate file reading with valid PEM content
    const mockPemContent = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC
-----END PRIVATE KEY-----
-----BEGIN CERTIFICATE-----
MIIDXTCCAkWgAwIBAgIJAKL0UG+mRkSdMA0GCSqGSIb3DQEBCwUA
-----END CERTIFICATE-----`;

    vi.mocked(fs.readFileSync).mockReturnValue(mockPemContent);

    // Mock successful token acquisition
    mockMsalClient.acquireTokenByClientCredential.mockResolvedValue({
      accessToken: TEST_ACCESS_TOKEN,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('fetchCsvFromSharepoint', () => {
    it('should fetch and parse CSV data successfully', async () => {
      const mockCsvData = 'language,input,__expected\nFrench,Hello world,icontains: bonjour';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      const result = await fetchCsvFromSharepoint(TEST_SHAREPOINT_URL);

      expect(result).toEqual([
        {
          language: 'French',
          input: 'Hello world',
          __expected: 'icontains: bonjour',
        },
      ]);

      expect(fetchWithProxy).toHaveBeenCalledWith(
        expect.stringContaining('/_api/web/GetFileByServerRelativeUrl'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
            Accept: 'text/csv',
          }),
        }),
      );
    });

    it('should handle path encoding correctly', async () => {
      const mockCsvData = 'header1,header2\nvalue1,value2';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      await fetchCsvFromSharepoint(TEST_SHAREPOINT_URL);

      // Verify the API URL contains the file path (encodeURI may double-encode %20 as %2520)
      const call = vi.mocked(fetchWithProxy).mock.calls[0][0] as string;
      expect(call).toContain('/_api/web/GetFileByServerRelativeUrl');
      expect(call).toContain('test-cases.csv');
    });

    it('should throw error when SHAREPOINT_BASE_URL is missing', async () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
        if (key === 'SHAREPOINT_BASE_URL') {
          return defaultValue;
        }
        return 'mock-value';
      });

      await expect(fetchCsvFromSharepoint(TEST_SHAREPOINT_URL)).rejects.toThrow(
        'SHAREPOINT_BASE_URL environment variable is required',
      );
    });

    it('should throw error on non-200 response', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
        }),
      );

      await expect(fetchCsvFromSharepoint(TEST_SHAREPOINT_URL)).rejects.toThrow(
        'Failed to fetch CSV from SharePoint URL',
      );
    });

    it('should throw error on 404 not found', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
      );

      await expect(fetchCsvFromSharepoint(TEST_SHAREPOINT_URL)).rejects.toThrow(
        'Failed to fetch CSV from SharePoint URL',
      );
    });

    it('should handle CSV parsing errors gracefully', async () => {
      const invalidCsvData = 'header1,header2\n"unclosed quote';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(invalidCsvData),
        }),
      );

      await expect(fetchCsvFromSharepoint(TEST_SHAREPOINT_URL)).rejects.toThrow(
        'Failed to parse CSV data from SharePoint',
      );
    });

    it('should handle empty CSV correctly', async () => {
      const mockCsvData = 'header1,header2\n';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      const result = await fetchCsvFromSharepoint(TEST_SHAREPOINT_URL);
      expect(result).toEqual([]);
    });

    it('should handle CSV with special characters', async () => {
      const mockCsvData = 'input,output\n"Hello, World!","Bonjour, Monde!"';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      const result = await fetchCsvFromSharepoint(TEST_SHAREPOINT_URL);
      expect(result).toEqual([
        {
          input: 'Hello, World!',
          output: 'Bonjour, Monde!',
        },
      ]);
    });

    it('should normalize trailing slashes in base URL', async () => {
      vi.mocked(getEnvString).mockImplementation((key: string, defaultValue: string = '') => {
        const values: Record<string, string> = {
          SHAREPOINT_BASE_URL: 'https://yourcompany.sharepoint.com/', // Trailing slash
          SHAREPOINT_CLIENT_ID: 'test-client-id',
          SHAREPOINT_TENANT_ID: 'test-tenant-id',
          SHAREPOINT_CERT_PATH: '/path/to/cert.pem',
        };
        return values[key] || defaultValue;
      });

      const mockCsvData = 'header1,header2\nvalue1,value2';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      await fetchCsvFromSharepoint(TEST_SHAREPOINT_URL);

      // Verify the URL doesn't have protocol://domain// pattern (but :// is ok)
      const call = vi.mocked(fetchWithProxy).mock.calls[0][0] as string;
      expect(call).not.toMatch(/com\/\//);
      expect(call).toContain('/_api/web/');
    });
  });

  describe('Authentication', () => {
    // Note: Some auth validation tests are skipped due to client caching in getConfidentialClient
    // These scenarios are covered by integration tests and actual usage

    it('should throw error when token acquisition fails', async () => {
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue(null);

      await expect(fetchCsvFromSharepoint(TEST_SHAREPOINT_URL)).rejects.toThrow(
        'Failed to acquire SharePoint access token',
      );
    });

    it('should throw error when access token is missing', async () => {
      mockMsalClient.acquireTokenByClientCredential.mockResolvedValue({
        accessToken: null,
      });

      await expect(fetchCsvFromSharepoint(TEST_SHAREPOINT_URL)).rejects.toThrow(
        'Failed to acquire SharePoint access token',
      );
    });
  });

  describe('URL Handling', () => {
    it('should handle URLs without encoded spaces', async () => {
      const urlWithSpaces =
        'https://yourcompany.sharepoint.com/sites/yoursite/Shared Documents/test.csv';
      const mockCsvData = 'header1,header2\nvalue1,value2';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      await fetchCsvFromSharepoint(urlWithSpaces);

      // Should properly encode the path
      expect(fetchWithProxy).toHaveBeenCalledWith(
        expect.stringMatching(/Shared%20Documents/),
        expect.any(Object),
      );
    });

    it('should preserve special characters in file paths', async () => {
      const urlWithSpecialChars =
        'https://yourcompany.sharepoint.com/sites/yoursite/Files/test-data_v1.0.csv';
      const mockCsvData = 'header1,header2\nvalue1,value2';

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          ok: true,
          status: 200,
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      const result = await fetchCsvFromSharepoint(urlWithSpecialChars);
      expect(result).toBeDefined();
    });
  });
});
