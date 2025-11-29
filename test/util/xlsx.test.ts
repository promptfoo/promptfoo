import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseXlsxFile } from '../../src/util/xlsx';

// Mock read-excel-file/node module
const mockReadXlsxFile = vi.fn();
const mockReadSheetNames = vi.fn();

vi.mock('read-excel-file/node', () => ({
  __esModule: true,
  default: (...args: any[]) => mockReadXlsxFile(...args),
  readSheetNames: (...args: any[]) => mockReadSheetNames(...args),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
}));

describe('parseXlsxFile', () => {
  let fs: any;

  beforeEach(async () => {
    fs = await import('fs');
    vi.resetAllMocks();

    // Mock fs.existsSync to return true by default
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

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

    it('should throw error when sheet name does not exist', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2', 'Sheet3']);

      await expect(parseXlsxFile('test.xlsx#NonExistent')).rejects.toThrow(
        'Sheet "NonExistent" not found. Available sheets: Sheet1, Sheet2, Sheet3',
      );
    });

    it('should throw error when sheet index is out of bounds', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);

      await expect(parseXlsxFile('test.xlsx#5')).rejects.toThrow(
        'Sheet index 5 is out of range. Available sheets: 2 (1-2)',
      );
    });

    it('should throw error when sheet index is 0', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);

      await expect(parseXlsxFile('test.xlsx#0')).rejects.toThrow(
        'Sheet index 0 is out of range. Available sheets: 2 (1-2)',
      );
    });

    it('should throw error when sheet index is negative', async () => {
      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);

      await expect(parseXlsxFile('test.xlsx#-1')).rejects.toThrow(
        'Sheet index -1 is out of range. Available sheets: 2 (1-2)',
      );
    });

    it('should use first sheet when # is at end with no sheet specifier', async () => {
      // Empty string after # is falsy, so it defaults to sheet 1
      const mockRows = [
        ['col1', 'col2'],
        ['value1', 'value2'],
      ];

      mockReadSheetNames.mockResolvedValue(['Sheet1', 'Sheet2']);
      mockReadXlsxFile.mockResolvedValue(mockRows);

      const result = await parseXlsxFile('test.xlsx#');

      expect(result).toEqual([{ col1: 'value1', col2: 'value2' }]);
      expect(mockReadXlsxFile).toHaveBeenCalledWith('test.xlsx', { sheet: 1 });
    });

    it('should handle sheet names with spaces', async () => {
      const mockRows = [
        ['col1', 'col2'],
        ['data', 'value'],
      ];

      mockReadSheetNames.mockResolvedValue(['Sheet 1', 'My Data Sheet', 'Sheet 3']);
      mockReadXlsxFile.mockResolvedValue(mockRows);

      const result = await parseXlsxFile('test.xlsx#My Data Sheet');

      expect(result).toEqual([{ col1: 'data', col2: 'value' }]);
      expect(mockReadXlsxFile).toHaveBeenCalledWith('test.xlsx', { sheet: 'My Data Sheet' });
    });
  });
});
