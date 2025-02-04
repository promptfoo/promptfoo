import { fetchWithProxy } from '../src/fetch';
import {
  fetchCsvFromGoogleSheetUnauthenticated,
  fetchCsvFromGoogleSheetAuthenticated,
  checkGoogleSheetAccess,
  writeCsvToGoogleSheet,
} from '../src/googleSheets';
import logger from '../src/logger';
import type { CsvRow } from '../src/types';
import { createMockResponse } from './util/utils';

interface MockSpreadsheets {
  get: jest.Mock;
  values: {
    get: jest.Mock;
    update: jest.Mock;
  };
  batchUpdate: jest.Mock;
}

jest.mock('../src/fetch', () => ({
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
      const mockFetch = jest.spyOn(global, 'fetch').mockImplementation();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
      } as Response);

      const result = await checkGoogleSheetAccess(TEST_SHEET_URL);
      expect(result).toEqual({ public: true, status: 200 });
      expect(mockFetch).toHaveBeenCalledWith(TEST_SHEET_URL);
    });

    it('should return public:false for inaccessible sheets', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockImplementation();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      } as Response);

      const result = await checkGoogleSheetAccess(TEST_SHEET_URL);
      expect(result).toEqual({ public: false, status: 403 });
      expect(mockFetch).toHaveBeenCalledWith(TEST_SHEET_URL);
    });

    it('should handle network errors gracefully', async () => {
      const mockFetch = jest.spyOn(global, 'fetch').mockImplementation();
      mockFetch.mockRejectedValue(new Error('Network error'));

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
            ['header1', 'header2'],
            ['value1', 'value2'],
          ],
        },
      };
      spreadsheets.values.get.mockResolvedValue(mockResponse);

      const result = await fetchCsvFromGoogleSheetAuthenticated(TEST_SHEET_URL);
      expect(result).toEqual([{ header1: 'value1', header2: 'value2' }]);
      expect(spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        range: 'A1:ZZZ',
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
        range: 'TestSheet!A1:ZZZ',
        auth: mockAuthClient,
      });
    });

    it('should throw error for invalid sheet URL', async () => {
      await expect(fetchCsvFromGoogleSheetAuthenticated('invalid-url')).rejects.toThrow(
        'Invalid Google Sheets URL',
      );
    });
  });

  describe('writeCsvToGoogleSheet', () => {
    const spreadsheets = mockSpreadsheetsApi as MockSpreadsheets;
    const testRows: CsvRow[] = [{ header1: 'value1', header2: 'value2' }];

    beforeEach(() => {
      jest.clearAllMocks();
      // Set up default sheet response
      spreadsheets.get.mockResolvedValue({
        data: {
          sheets: [
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

    it('should write data to existing sheet', async () => {
      const mockDate = 1234567890;
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);
      spreadsheets.values.update.mockResolvedValue({});

      await writeCsvToGoogleSheet(testRows, TEST_SHEET_URL);
      expect(spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        range: `Sheet${mockDate}!A1:ZZZ`,
        valueInputOption: 'USER_ENTERED',
        auth: mockAuthClient,
        requestBody: {
          values: [
            ['header1', 'header2'],
            ['value1', 'value2'],
          ],
        },
      });
    });

    it('should create new sheet when no gid provided', async () => {
      // Mock Date.now() to get consistent sheet names in tests
      const mockDate = 1234567890;
      jest.spyOn(Date, 'now').mockReturnValue(mockDate);

      spreadsheets.batchUpdate.mockResolvedValue({});
      spreadsheets.values.update.mockResolvedValue({});

      await writeCsvToGoogleSheet(testRows, TEST_SHEET_URL);
      expect(spreadsheets.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        auth: mockAuthClient,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: `Sheet${mockDate}`,
                },
              },
            },
          ],
        },
      });
    });

    it('should use existing sheet when gid provided', async () => {
      spreadsheets.values.update.mockResolvedValue({});

      await writeCsvToGoogleSheet(testRows, TEST_SHEET_URL_WITH_GID);
      expect(spreadsheets.batchUpdate).not.toHaveBeenCalled();
      expect(spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: '1234567890',
        range: 'TestSheet!A1:ZZZ',
        valueInputOption: 'USER_ENTERED',
        auth: mockAuthClient,
        requestBody: {
          values: [
            ['header1', 'header2'],
            ['value1', 'value2'],
          ],
        },
      });
    });

    it('should throw error for invalid sheet URL', async () => {
      await expect(writeCsvToGoogleSheet(testRows, 'invalid-url')).rejects.toThrow(
        'Invalid Google Sheets URL',
      );
    });
  });
});
