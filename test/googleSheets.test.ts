import {
  checkGoogleSheetAccess,
  fetchCsvFromGoogleSheetAuthenticated,
  fetchCsvFromGoogleSheetUnauthenticated,
  writeCsvToGoogleSheet,
} from '../src/googleSheets';
import logger from '../src/logger';
import { fetchWithProxy } from '../src/util/fetch';
import { createMockResponse } from './util/utils';

import type { CsvRow } from '../src/types';

interface MockSpreadsheets {
  get: jest.Mock;
  values: {
    get: jest.Mock;
    update: jest.Mock;
  };
  batchUpdate: jest.Mock;
}

jest.mock('../src/util/fetch/index.ts', () => ({
  fetchWithProxy: jest.fn(),
}));

const mockSpreadsheetsApi = {
  get: jest.fn(),
  values: {
    get: jest.fn(),
    update: jest.fn(),
  },
  batchUpdate: jest.fn(),
};

// Update mock setup for better auth handling
const mockAuthClient = {
  getClient: jest.fn().mockResolvedValue({}),
};

// Mock Google Sheets API
jest.mock('@googleapis/sheets', () => {
  return {
    sheets: jest.fn(() => ({
      spreadsheets: mockSpreadsheetsApi,
    })),
    auth: {
      GoogleAuth: jest.fn(() => mockAuthClient),
    },
  };
});

describe('Google Sheets Integration', () => {
  const TEST_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1234567890/edit';
  const TEST_SHEET_URL_WITH_GID =
    'https://docs.google.com/spreadsheets/d/1234567890/edit?gid=98765';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkGoogleSheetAccess', () => {
    it('should return public:true for accessible sheets', async () => {
      jest.mocked(fetchWithProxy).mockResolvedValue(createMockResponse({ status: 200 }));

      const result = await checkGoogleSheetAccess(TEST_SHEET_URL);
      expect(result).toEqual({ public: true, status: 200 });
      expect(fetchWithProxy).toHaveBeenCalledWith(TEST_SHEET_URL);
    });

    it('should return public:false for inaccessible sheets', async () => {
      jest.mocked(fetchWithProxy).mockResolvedValue(createMockResponse({ status: 403 }));

      const result = await checkGoogleSheetAccess(TEST_SHEET_URL);
      expect(result).toEqual({ public: false, status: 403 });
      expect(fetchWithProxy).toHaveBeenCalledWith(TEST_SHEET_URL);
    });

    it('should handle network errors gracefully', async () => {
      jest.mocked(fetchWithProxy).mockRejectedValue(new Error('Network error'));

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

      jest.mocked(fetchWithProxy).mockResolvedValue(
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

      jest.mocked(fetchWithProxy).mockResolvedValue(
        createMockResponse({
          text: () => Promise.resolve(mockCsvData),
        }),
      );

      await fetchCsvFromGoogleSheetUnauthenticated(TEST_SHEET_URL_WITH_GID);
      expect(fetchWithProxy).toHaveBeenCalledWith(expectedUrl);
    });

    it('should throw error on non-200 response', async () => {
      jest.mocked(fetchWithProxy).mockResolvedValue(createMockResponse({ status: 403 }));

      await expect(fetchCsvFromGoogleSheetUnauthenticated(TEST_SHEET_URL)).rejects.toThrow(
        'Failed to fetch CSV from Google Sheets URL',
      );
    });
  });

  describe('fetchCsvFromGoogleSheetAuthenticated', () => {
    const spreadsheets = mockSpreadsheetsApi as MockSpreadsheets;

    beforeEach(() => {
      jest.clearAllMocks();
      // Set up default sheet response
      spreadsheets.get.mockResolvedValue({
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

    it('should fetch and parse authenticated sheet data', async () => {
      const mockResponse = {
        data: {
          values: [
            ['header1', 'header2', 'header3'],
            ['value1', 'value2'],
          ],
        },
      };
      spreadsheets.values.get.mockResolvedValue(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);
      expect(result).toEqual([{ header1: 'value1', header2: 'value2', header3: '' }]);
      expect(spreadsheets.get).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        auth: mockAuthClient,
      });
      expect(spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        range: 'Sheet1',
        auth: mockAuthClient,
      });
    });

    it('should handle gid parameter correctly', async () => {
      spreadsheets.values.get.mockResolvedValue({
        data: {
          values: [['header'], ['value']],
        },
      });

      await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL_WITH_GID);
      expect(spreadsheets.get).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        auth: mockAuthClient,
      });
      expect(spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        range: 'TestSheet',
        auth: mockAuthClient,
      });
    });

    it('should throw error for invalid sheet URL', async () => {
      await expect(fetchCsvFromGoogleSheetAuthenticated('invalid-url')).rejects.toThrow(
        'Invalid Google Sheets URL',
      );
    });

    it('should throw error when no sheets found', async () => {
      spreadsheets.get.mockResolvedValue({
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
    const spreadsheets = mockSpreadsheetsApi as MockSpreadsheets;

    beforeEach(() => {
      jest.clearAllMocks();
      // Set up default sheet response
      spreadsheets.get.mockResolvedValue({
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

      spreadsheets.values.get.mockResolvedValue(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);

      // Verify the API was called with just the sheet name
      expect(spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        range: 'Sheet1',
        auth: mockAuthClient,
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

      spreadsheets.values.get.mockResolvedValue(mockResponse);

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

      spreadsheets.values.get.mockResolvedValue(mockResponse);

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

      spreadsheets.values.get.mockResolvedValue(mockResponse);

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

      spreadsheets.get.mockResolvedValue({
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

      spreadsheets.values.get.mockResolvedValue({
        data: { values: testData },
      });

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);

      // Verify the API was called with just the sheet name (not a huge range)
      expect(spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        range: 'WideSheet',
        auth: mockAuthClient,
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
        jest.clearAllMocks(); // Clear mocks between iterations

        const headers = Array.from({ length: cols }, (_, i) => `col${i + 1}`);
        const mockRows: CsvRow[] = [
          headers.reduce((acc, header) => ({ ...acc, [header]: 'value' }), {}),
        ];

        spreadsheets.values.update.mockResolvedValue({});
        spreadsheets.batchUpdate.mockResolvedValue({});

        await writeCsvToGoogleSheet(mockRows, TEST_SHEET_URL);

        const updateCall = spreadsheets.values.update.mock.calls[0][0];
        const range = updateCall.range;
        const endColumn = range.match(/!A1:([A-Z]+)\d+/)?.[1];

        expect(endColumn).toBe(expected);
      }
    });
  });
});
