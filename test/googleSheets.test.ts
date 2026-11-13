import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkGoogleSheetAccess,
  fetchCsvFromGoogleSheet,
  fetchCsvFromGoogleSheetAuthenticated,
  fetchCsvFromGoogleSheetUnauthenticated,
  writeCsvToGoogleSheet,
} from '../src/googleSheets';
import logger from '../src/logger';
import { fetchWithProxy } from '../src/util/fetch/index';
import { createMockResponse, mockProcessEnv } from './util/utils';

import type { CsvRow } from '../src/types/index';

vi.mock('../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));

const request = vi.fn();
const getUniverseDomain = vi.fn();
const mockGoogleAuth = vi.fn(function GoogleAuthMock() {
  return { request, getUniverseDomain };
});
vi.mock('google-auth-library', () => ({ GoogleAuth: mockGoogleAuth }));

const expectedGet = { method: 'GET', retry: true, headers: expect.any(Object) };
const spreadsheetUrl = 'https://sheets.googleapis.com/v4/spreadsheets/1234567890';

describe('Google Sheets Integration', () => {
  const TEST_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1234567890/edit';
  const TEST_SHEET_URL_WITH_GID =
    'https://docs.google.com/spreadsheets/d/1234567890/edit?gid=98765';

  beforeEach(() => {
    vi.clearAllMocks();
    request.mockReset();
    getUniverseDomain.mockResolvedValue('googleapis.com');
    vi.spyOn(logger, 'error').mockImplementation(() => {});
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    return mockProcessEnv({ GOOGLE_CLOUD_UNIVERSE_DOMAIN: 'googleapis.com' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkGoogleSheetAccess', () => {
    it('should return public:true for accessible sheets', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue(createMockResponse({ status: 200 }));

      const result = await checkGoogleSheetAccess(TEST_SHEET_URL);
      expect(result).toEqual({ public: true, status: 200 });
      expect(fetchWithProxy).toHaveBeenCalledWith(TEST_SHEET_URL);
    });

    it('should return public:false for inaccessible sheets', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue(createMockResponse({ status: 403 }));

      const result = await checkGoogleSheetAccess(TEST_SHEET_URL);
      expect(result).toEqual({ public: false, status: 403 });
      expect(fetchWithProxy).toHaveBeenCalledWith(TEST_SHEET_URL);
    });

    it('should handle network errors gracefully', async () => {
      vi.mocked(fetchWithProxy).mockRejectedValue(new Error('Network error'));

      const result = await checkGoogleSheetAccess(TEST_SHEET_URL);
      expect(result).toEqual({ public: false });
      expect(logger.error).toHaveBeenCalledWith(
        `Error checking sheet access: ${new Error('Network error')}`,
      );
    });
  });

  describe('fetchCsvFromGoogleSheetUnauthenticated', () => {
    it('should fetch and parse CSV data correctly', async () => {
      const mockCsvData = 'header1,header2\nvalue1,value2';
      const expectedUrl = `${TEST_SHEET_URL.replace(/\/edit.*$/, '/export')}?format=csv`;

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      const result = await fetchCsvFromGoogleSheetUnauthenticated(TEST_SHEET_URL);
      expect(result).toEqual([{ header1: 'value1', header2: 'value2' }]);
      expect(fetchWithProxy).toHaveBeenCalledWith(expectedUrl);
    });

    it('should handle gid parameter correctly', async () => {
      const mockCsvData = 'header1,header2\nvalue1,value2';
      const baseUrl = TEST_SHEET_URL_WITH_GID.replace(/\/edit.*$/, '/export');
      const expectedUrl = `${baseUrl}?format=csv&gid=98765`;

      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      await fetchCsvFromGoogleSheetUnauthenticated(TEST_SHEET_URL_WITH_GID);
      expect(fetchWithProxy).toHaveBeenCalledWith(expectedUrl);
    });

    it('should read the gid from the URL fragment', async () => {
      vi.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({ text: () => Promise.resolve('header\nvalue') }),
      );

      await fetchCsvFromGoogleSheetUnauthenticated(`${TEST_SHEET_URL}#gid=98765`);
      expect(fetchWithProxy).toHaveBeenCalledWith(
        'https://docs.google.com/spreadsheets/d/1234567890/export?format=csv&gid=98765',
      );
    });

    it('propagates a public CSV export failure without requesting credentials', async () => {
      vi.mocked(fetchWithProxy)
        .mockResolvedValueOnce(createMockResponse({ status: 200 }))
        .mockResolvedValueOnce(createMockResponse({ status: 403 }));

      await expect(fetchCsvFromGoogleSheet(TEST_SHEET_URL)).rejects.toThrow(
        'Failed to fetch CSV from Google Sheets URL',
      );
      expect(mockGoogleAuth).not.toHaveBeenCalled();
    });
  });

  describe('fetchCsvFromGoogleSheetAuthenticated', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Set up default sheet response
      request.mockReset().mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Sheet1',
              },
            },
            {
              properties: {
                sheetId: 98765,
                title: 'TestSheet',
              },
            },
          ],
        },
      });
    });

    it('negotiates gzip for metadata and values through the Google Auth transport', async () => {
      const { OAuth2Client } =
        await vi.importActual<typeof import('google-auth-library')>('google-auth-library');
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json({ sheets: [{ properties: { title: 'Sheet1' } }] }))
        .mockResolvedValueOnce(Response.json({ values: [['header'], ['value']] }));
      const client = new OAuth2Client({ transporterOptions: { fetchImplementation: fetch } });
      client.setCredentials({ access_token: 'fixture-token' });
      request.mockReset().mockImplementation((options) => client.request(options));

      await expect(fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL)).resolves.toEqual([
        { header: 'value' },
      ]);
      expect(fetch).toHaveBeenCalledTimes(2);
      for (const [, options] of fetch.mock.calls) {
        const headers = new Headers(options?.headers);
        expect(headers.get('Accept-Encoding')).toBe('gzip');
        expect(headers.get('User-Agent')).toContain('(gzip)');
        expect(headers.get('Authorization')).toBe('Bearer fixture-token');
      }
    });

    it('should fetch and parse authenticated sheet data', async () => {
      const mockResponse = {
        data: {
          values: [
            ['header1', 'header2', 'header3'],
            ['value1', 'value2'],
          ],
        },
      };
      request.mockResolvedValueOnce(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);
      expect(result).toEqual([{ header1: 'value1', header2: 'value2', header3: '' }]);
      expect(request).toHaveBeenCalledWith({ url: spreadsheetUrl, ...expectedGet });
      expect(request).toHaveBeenCalledWith({
        url: `${spreadsheetUrl}/values/Sheet1`,
        ...expectedGet,
      });
    });

    it('keeps reserved characters in a sheet title inside a single URL segment', async () => {
      request
        .mockReset()
        .mockResolvedValueOnce({ data: { sheets: [{ properties: { title: 'Sales / Q1?#' } }] } })
        .mockResolvedValueOnce({ data: { values: [['header']] } });
      await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);
      expect(request).toHaveBeenLastCalledWith({
        url: `${spreadsheetUrl}/values/Sales%20%2F%20Q1%3F%23`,
        ...expectedGet,
      });
      expect(mockGoogleAuth).toHaveBeenCalledWith({
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });
    });

    it('rejects path traversal segments before issuing a request', async () => {
      await expect(
        fetchCsvFromGoogleSheetAuthenticated('https://docs.google.com/spreadsheets/d/../edit'),
      ).rejects.toThrow('Invalid Google Sheets path segment');
      expect(request).not.toHaveBeenCalled();
    });

    it('uses the configured Google universe when credentials match', async () => {
      const restore = mockProcessEnv({ GOOGLE_CLOUD_UNIVERSE_DOMAIN: 'example.test' });
      try {
        getUniverseDomain.mockResolvedValue('example.test');
        request.mockResolvedValueOnce({ data: { values: [['header']] } });
        await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);
        expect(request).toHaveBeenLastCalledWith({
          url: 'https://sheets.example.test/v4/spreadsheets/1234567890/values/Sheet1',
          ...expectedGet,
        });
      } finally {
        restore();
      }
    });

    it('requires the credential universe to match the configured endpoint', async () => {
      getUniverseDomain.mockResolvedValue('different.example');
      await expect(fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL)).rejects.toThrow(
        'does not match',
      );
      expect(request).not.toHaveBeenCalled();
    });

    it('should handle gid parameter correctly', async () => {
      request.mockResolvedValueOnce({
        data: {
          values: [['header'], ['value']],
        },
      });

      await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL_WITH_GID);
      expect(request).toHaveBeenCalledWith({ url: spreadsheetUrl, ...expectedGet });
      expect(request).toHaveBeenCalledWith({
        url: `${spreadsheetUrl}/values/TestSheet`,
        ...expectedGet,
      });
    });

    it('should read the gid from the URL fragment', async () => {
      request.mockResolvedValueOnce({ data: { values: [['header'], ['value']] } });

      await fetchCsvFromGoogleSheetAuthenticated(`${TEST_SHEET_URL}#gid=98765`);
      expect(request).toHaveBeenCalledWith({
        url: `${spreadsheetUrl}/values/TestSheet`,
        ...expectedGet,
      });
    });

    it('should select gid 0 even when it is not the first sheet', async () => {
      request.mockReset().mockResolvedValueOnce({
        data: {
          sheets: [
            { properties: { sheetId: 98765, title: 'TestSheet' } },
            { properties: { sheetId: 0, title: 'Sheet1' } },
          ],
        },
      });
      request.mockResolvedValueOnce({ data: { values: [['header'], ['value']] } });

      await fetchCsvFromGoogleSheetAuthenticated(`${TEST_SHEET_URL}?gid=0`);
      expect(request).toHaveBeenCalledWith({
        url: `${spreadsheetUrl}/values/Sheet1`,
        ...expectedGet,
      });
    });

    it('should throw error for invalid sheet URL', async () => {
      await expect(fetchCsvFromGoogleSheetAuthenticated('invalid-url')).rejects.toThrow(
        'Invalid Google Sheets URL',
      );
    });

    it('should throw error when no sheets found', async () => {
      request.mockReset().mockResolvedValueOnce({
        data: {
          sheets: [],
        },
      });

      await expect(fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL)).rejects.toThrow(
        'No sheets found in spreadsheet',
      );
    });

    it('should throw error when sheet with gid not found', async () => {
      await expect(
        fetchCsvFromGoogleSheetAuthenticated(
          'https://docs.google.com/spreadsheets/d/1234567890/edit?gid=99999',
        ),
      ).rejects.toThrow('Sheet not found for gid: 99999');
    });
  });

  describe('Range behavior and backwards compatibility', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Set up default sheet response
      request.mockReset().mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Sheet1',
              },
            },
          ],
        },
      });
    });

    it('should retrieve all data when using sheet name only (no range specified)', async () => {
      const mockResponse = {
        data: {
          values: [
            ['header1', 'header2', 'header3'],
            ['value1', 'value2', 'value3'],
            ['value4', 'value5', 'value6'],
          ],
        },
      };

      request.mockResolvedValueOnce(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);

      // Verify the API was called with just the sheet name
      expect(request).toHaveBeenCalledWith({
        url: `${spreadsheetUrl}/values/Sheet1`,
        ...expectedGet,
      });

      // Verify all data was returned
      expect(result).toEqual([
        { header1: 'value1', header2: 'value2', header3: 'value3' },
        { header1: 'value4', header2: 'value5', header3: 'value6' },
      ]);
    });

    it('should handle empty cells correctly with sheet name only', async () => {
      const mockResponse = {
        data: {
          values: [
            ['header1', 'header2', 'header3', 'header4'],
            ['value1', '', 'value3'], // Missing value2 and header4
            ['', 'value5', '', 'value7'], // Missing header1 and header3
          ],
        },
      };

      request.mockResolvedValueOnce(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);

      expect(result).toEqual([
        { header1: 'value1', header2: '', header3: 'value3', header4: '' },
        { header1: '', header2: 'value5', header3: '', header4: 'value7' },
      ]);
    });

    it('should handle sheets with many columns beyond Z', async () => {
      // Create headers for columns A through AZ (52 columns)
      const headers = [];
      for (let i = 0; i < 52; i++) {
        headers.push(`header${i + 1}`);
      }

      const row1 = headers.map((_, i) => `value${i + 1}`);

      const mockResponse = {
        data: {
          values: [headers, row1],
        },
      };

      request.mockResolvedValueOnce(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);

      // Verify all 52 columns were retrieved
      expect(Object.keys(result[0])).toHaveLength(52);
      expect(result[0].header52).toBe('value52');
    });

    it('should handle trailing empty rows and columns correctly', async () => {
      // According to Google Sheets API docs, trailing empty rows and columns are omitted
      const mockResponse = {
        data: {
          values: [
            ['header1', 'header2', 'header3'],
            ['value1', 'value2', ''], // Trailing empty cell
            ['value4', '', ''], // Two trailing empty cells
            // Trailing empty rows are not included in the response
          ],
        },
      };

      request.mockResolvedValueOnce(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);

      expect(result).toEqual([
        { header1: 'value1', header2: 'value2', header3: '' },
        { header1: 'value4', header2: '', header3: '' },
      ]);
    });

    it('should handle very wide sheets efficiently', async () => {
      // Create a sheet with 100 columns
      const headers = Array.from({ length: 100 }, (_, i) => `Col${i + 1}`);
      const row1 = Array.from({ length: 100 }, (_, i) => `Val${i + 1}`);
      const testData = [headers, row1];

      request.mockReset().mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'WideSheet',
              },
            },
          ],
        },
      });

      request.mockResolvedValueOnce({
        data: { values: testData },
      });

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);

      // Verify the API was called with just the sheet name (not a huge range)
      expect(request).toHaveBeenCalledWith({
        url: `${spreadsheetUrl}/values/WideSheet`,
        ...expectedGet,
      });

      // Verify all 100 columns were retrieved
      expect(Object.keys(result[0])).toHaveLength(100);
      expect(result[0].Col100).toBe('Val100');
    });

    it('should calculate correct column letters for write operations', async () => {
      // Test the column letter calculation for various sizes
      const testCases = [
        { cols: 1, expected: 'A' },
        { cols: 26, expected: 'Z' },
        { cols: 27, expected: 'AA' },
        { cols: 52, expected: 'AZ' },
        { cols: 53, expected: 'BA' },
        { cols: 702, expected: 'ZZ' },
        { cols: 703, expected: 'AAA' },
      ];

      for (const { cols, expected } of testCases) {
        vi.clearAllMocks(); // Clear mocks between iterations

        const headers = Array.from({ length: cols }, (_, i) => `col${i + 1}`);
        const mockRows: CsvRow[] = [
          headers.reduce((acc, header) => ({ ...acc, [header]: 'value' }), {}),
        ];

        request.mockReset().mockResolvedValue({});

        await writeCsvToGoogleSheet(mockRows, TEST_SHEET_URL);

        const create = request.mock.calls[0][0];
        expect(create).toMatchObject({ url: `${spreadsheetUrl}:batchUpdate`, method: 'POST' });
        const title = create.data.requests[0].addSheet.properties.title;
        const range = decodeURIComponent(request.mock.calls[1][0].url.split('/values/')[1]);
        expect(range.startsWith(`${title}!A1:`)).toBe(true);
        const endColumn = range.match(/!A1:([A-Z]+)\d+/)?.[1];

        expect(endColumn).toBe(expected);
      }
    });
  });

  describe('writeCsvToGoogleSheet', () => {
    it('should write to the sheet a fragment gid selects instead of adding one', async () => {
      request.mockReset().mockResolvedValueOnce({
        data: { sheets: [{ properties: { sheetId: 0, title: 'Results' } }] },
      });
      request.mockResolvedValueOnce({});

      await writeCsvToGoogleSheet([{ input: 'hi', output: 'hello' }], `${TEST_SHEET_URL}#gid=0`);

      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenLastCalledWith({
        url: `${spreadsheetUrl}/values/Results%21A1%3AB2`,
        method: 'PUT',
        retry: true,
        params: { valueInputOption: 'USER_ENTERED' },
        data: {
          values: [
            ['input', 'output'],
            ['hi', 'hello'],
          ],
        },
      });
    });
  });
});
