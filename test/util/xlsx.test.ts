import { parseXlsxFile } from '../../src/util/xlsx';

// Mock read-excel-file/node module
const mockReadXlsxFile = jest.fn();
const mockReadSheetNames = jest.fn();

jest.mock('read-excel-file/node', () => ({
  __esModule: true,
  default: (...args: any[]) => mockReadXlsxFile(...args),
  readSheetNames: (...args: any[]) => mockReadSheetNames(...args),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

describe('parseXlsxFile', () => {
  let fs: any;

  beforeEach(async () => {
    fs = require('fs');
    jest.resetAllMocks();

    // Mock fs.existsSync to return true by default
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should parse xlsx file successfully', async () => {
    // read-excel-file returns array of arrays where first row is headers
    const mockRows = [
      ['col1', 'col2'], // headers
      ['value1', 'value2'], // data row 1
      ['value3', 'value4'], // data row 2
    ];

    mockReadSheetNames.mockResolvedValue(['Sheet1']);
    mockReadXlsxFile.mockResolvedValue(mockRows);

    const result = await parseXlsxFile('test.xlsx');

    expect(result).toEqual([
      { col1: 'value1', col2: 'value2' },
      { col1: 'value3', col2: 'value4' },
    ]);
    expect(mockReadXlsxFile).toHaveBeenCalledWith('test.xlsx', { sheet: 1 });
  });

  it('should throw error when read-excel-file module is not installed', async () => {
    mockReadSheetNames.mockRejectedValue(new Error("Cannot find module 'read-excel-file/node'"));

    await expect(parseXlsxFile('test.xlsx')).rejects.toThrow(
      'read-excel-file is not installed. Please install it with: npm install read-excel-file',
    );
  });

  it('should throw error when file parsing fails', async () => {
    mockReadSheetNames.mockResolvedValue(['Sheet1']);
    mockReadXlsxFile.mockRejectedValue(new Error('Failed to read file'));

    await expect(parseXlsxFile('test.xlsx')).rejects.toThrow(
      'Failed to parse Excel file test.xlsx: Failed to read file',
    );
  });

  it('should handle empty sheets', async () => {
    mockReadSheetNames.mockResolvedValue(['Sheet1']);
    mockReadXlsxFile.mockResolvedValue([]);

    await expect(parseXlsxFile('test.xlsx')).rejects.toThrow(
      'Sheet "Sheet1" is empty or contains no valid data rows',
    );
  });

  it('should use first sheet by default', async () => {
    const mockRows = [
      ['col1', 'col2'],
      ['value1', 'value2'],
    ];

    mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);
    mockReadXlsxFile.mockResolvedValue(mockRows);

    const result = await parseXlsxFile('test.xlsx');

    expect(result).toEqual([{ col1: 'value1', col2: 'value2' }]);
    expect(mockReadXlsxFile).toHaveBeenCalledWith('test.xlsx', { sheet: 1 });
  });

  it('should handle malformed Excel files gracefully', async () => {
    mockReadSheetNames.mockResolvedValue(['Sheet1']);
    mockReadXlsxFile.mockRejectedValue(new Error('Invalid file format or corrupted file'));

    await expect(parseXlsxFile('corrupted.xlsx')).rejects.toThrow(
      'Failed to parse Excel file corrupted.xlsx: Invalid file format or corrupted file',
    );
  });

  it('should throw specific error when file does not exist', async () => {
    // Override the default mock for this test
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    await expect(parseXlsxFile('nonexistent.xlsx')).rejects.toThrow(
      'File not found: nonexistent.xlsx',
    );
  });

  describe('sheet selection syntax', () => {
    it('should select sheet by name using # syntax', async () => {
      const mockRows = [
        ['col1', 'col2'],
        ['sheet2data', 'value2'],
      ];

      mockReadSheetNames.mockResolvedValue(['Sheet1', 'DataSheet', 'Sheet3']);
      mockReadXlsxFile.mockResolvedValue(mockRows);

      const result = await parseXlsxFile('test.xlsx#DataSheet');

      expect(result).toEqual([{ col1: 'sheet2data', col2: 'value2' }]);
      expect(mockReadXlsxFile).toHaveBeenCalledWith('test.xlsx', { sheet: 'DataSheet' });
    });

    it('should select sheet by 1-based index using # syntax', async () => {
      const mockRows = [
        ['col1', 'col2'],
        ['sheet2data', 'value2'],
      ];

      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2', 'Sheet3']);
      mockReadXlsxFile.mockResolvedValue(mockRows);

      const result = await parseXlsxFile('test.xlsx#2');

      expect(result).toEqual([{ col1: 'sheet2data', col2: 'value2' }]);
      expect(mockReadXlsxFile).toHaveBeenCalledWith('test.xlsx', { sheet: 2 });
    });

    it('should throw error for non-existent sheet name', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);

      await expect(parseXlsxFile('test.xlsx#NonExistentSheet')).rejects.toThrow(
        'Sheet "NonExistentSheet" not found. Available sheets: Sheet1, Sheet2',
      );
    });

    it('should throw error for out-of-range sheet index', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);

      await expect(parseXlsxFile('test.xlsx#5')).rejects.toThrow(
        'Sheet index 5 is out of range. Available sheets: 2 (1-2)',
      );
    });

    it('should throw error for zero or negative sheet index', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);

      await expect(parseXlsxFile('test.xlsx#0')).rejects.toThrow(
        'Sheet index 0 is out of range. Available sheets: 2 (1-2)',
      );
    });
  });

  describe('data validation', () => {
    it('should throw error for empty sheet', async () => {
      mockReadSheetNames.mockResolvedValue(['EmptySheet']);
      mockReadXlsxFile.mockResolvedValue([]);

      await expect(parseXlsxFile('test.xlsx#EmptySheet')).rejects.toThrow(
        'Sheet "EmptySheet" is empty or contains no valid data rows',
      );
    });

    it('should throw error for sheet with no headers', async () => {
      mockReadSheetNames.mockResolvedValue(['NoHeaders']);
      // Sheet with only empty headers
      mockReadXlsxFile.mockResolvedValue([['', '']]);

      await expect(parseXlsxFile('test.xlsx#NoHeaders')).rejects.toThrow(
        'Sheet "NoHeaders" has no valid column headers',
      );
    });

    it('should throw error for sheet with only empty data', async () => {
      mockReadSheetNames.mockResolvedValue(['EmptyData']);
      mockReadXlsxFile.mockResolvedValue([
        ['col1', 'col2'], // headers
        ['', ''], // empty data
        ['   ', ''], // whitespace only
        ['', '  '], // whitespace only
      ]);

      await expect(parseXlsxFile('test.xlsx#EmptyData')).rejects.toThrow(
        'Sheet "EmptyData" contains only empty data. Please ensure the sheet has both headers and data rows.',
      );
    });

    it('should accept sheet with some valid data', async () => {
      mockReadSheetNames.mockResolvedValue(['ValidData']);
      mockReadXlsxFile.mockResolvedValue([
        ['col1', 'col2'], // headers
        ['', 'valid data'], // some valid data
        ['   ', ''], // empty
      ]);

      const result = await parseXlsxFile('test.xlsx#ValidData');
      expect(result).toEqual([
        { col1: '', col2: 'valid data' },
        { col1: '   ', col2: '' },
      ]);
    });

    it('should handle null values in cells', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1']);
      mockReadXlsxFile.mockResolvedValue([
        ['col1', 'col2'],
        [null, 'value2'],
        ['value3', null],
      ]);

      const result = await parseXlsxFile('test.xlsx');
      expect(result).toEqual([
        { col1: '', col2: 'value2' },
        { col1: 'value3', col2: '' },
      ]);
    });

    it('should handle numeric values', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1']);
      mockReadXlsxFile.mockResolvedValue([
        ['id', 'value'],
        [1, 42.5],
        [2, 100],
      ]);

      const result = await parseXlsxFile('test.xlsx');
      expect(result).toEqual([
        { id: '1', value: '42.5' },
        { id: '2', value: '100' },
      ]);
    });
  });
});
