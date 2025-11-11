import { parseXlsxFile } from '../../src/util/xlsx';

jest.mock('xlsx', () => ({
  readFile: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
}));

describe('parseXlsxFile', () => {
  let xlsx: any;
  let fs: any;

  beforeEach(async () => {
    xlsx = await import('xlsx');
    fs = require('fs');
    jest.resetAllMocks();

    // Mock fs.existsSync to return true by default
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should parse xlsx file successfully', async () => {
    const mockData = [
      { col1: 'value1', col2: 'value2' },
      { col1: 'value3', col2: 'value4' },
    ];

    xlsx.readFile.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {},
      },
    });

    xlsx.utils.sheet_to_json.mockReturnValue(mockData);

    const result = await parseXlsxFile('test.xlsx');

    expect(result).toEqual(mockData);
    expect(xlsx.readFile).toHaveBeenCalledWith('test.xlsx');
    expect(xlsx.utils.sheet_to_json).toHaveBeenCalledWith({}, { defval: '' });
  });

  it('should throw error when xlsx module is not installed', async () => {
    xlsx.readFile.mockImplementation(() => {
      throw new Error("Cannot find module 'xlsx'");
    });

    await expect(parseXlsxFile('test.xlsx')).rejects.toThrow(
      'xlsx is not installed. Please install it with: npm install xlsx',
    );
  });

  it('should throw error when file parsing fails', async () => {
    xlsx.readFile.mockImplementation(() => {
      throw new Error('Failed to read file');
    });

    await expect(parseXlsxFile('test.xlsx')).rejects.toThrow(
      'Failed to parse Excel file test.xlsx: Failed to read file',
    );
  });

  it('should handle empty sheets', async () => {
    xlsx.readFile.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: {},
      },
    });

    xlsx.utils.sheet_to_json.mockReturnValue([]);

    await expect(parseXlsxFile('test.xlsx')).rejects.toThrow(
      'Sheet "Sheet1" is empty or contains no valid data rows',
    );
  });

  it('should use first sheet by default', async () => {
    const mockData = [{ col1: 'value1', col2: 'value2' }];

    xlsx.readFile.mockReturnValue({
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: {
        Sheet1: {},
        Sheet2: {},
      },
    });

    xlsx.utils.sheet_to_json.mockReturnValue(mockData);

    const result = await parseXlsxFile('test.xlsx');

    expect(result).toEqual(mockData);
    expect(xlsx.utils.sheet_to_json).toHaveBeenCalledWith({}, { defval: '' });
  });

  it('should handle malformed Excel files gracefully', async () => {
    xlsx.readFile.mockImplementation(() => {
      throw new Error('Invalid file format or corrupted file');
    });

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
      const mockData = [{ col1: 'sheet2data', col2: 'value2' }];

      xlsx.readFile.mockReturnValue({
        SheetNames: ['Sheet1', 'DataSheet', 'Sheet3'],
        Sheets: {
          Sheet1: { data: 'sheet1' },
          DataSheet: { data: 'datasheet' },
          Sheet3: { data: 'sheet3' },
        },
      });

      xlsx.utils.sheet_to_json.mockReturnValue(mockData);

      const result = await parseXlsxFile('test.xlsx#DataSheet');

      expect(result).toEqual(mockData);
      expect(xlsx.utils.sheet_to_json).toHaveBeenCalledWith({ data: 'datasheet' }, { defval: '' });
    });

    it('should select sheet by 1-based index using # syntax', async () => {
      const mockData = [{ col1: 'sheet2data', col2: 'value2' }];

      xlsx.readFile.mockReturnValue({
        SheetNames: ['Sheet1', 'Sheet2', 'Sheet3'],
        Sheets: {
          Sheet1: { data: 'sheet1' },
          Sheet2: { data: 'sheet2' },
          Sheet3: { data: 'sheet3' },
        },
      });

      xlsx.utils.sheet_to_json.mockReturnValue(mockData);

      const result = await parseXlsxFile('test.xlsx#2');

      expect(result).toEqual(mockData);
      expect(xlsx.utils.sheet_to_json).toHaveBeenCalledWith({ data: 'sheet2' }, { defval: '' });
    });

    it('should throw error for non-existent sheet name', async () => {
      xlsx.readFile.mockReturnValue({
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {},
          Sheet2: {},
        },
      });

      await expect(parseXlsxFile('test.xlsx#NonExistentSheet')).rejects.toThrow(
        'Sheet "NonExistentSheet" not found. Available sheets: Sheet1, Sheet2',
      );
    });

    it('should throw error for out-of-range sheet index', async () => {
      xlsx.readFile.mockReturnValue({
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {},
          Sheet2: {},
        },
      });

      await expect(parseXlsxFile('test.xlsx#5')).rejects.toThrow(
        'Sheet index 5 is out of range. Available sheets: 2 (1-2)',
      );
    });

    it('should throw error for zero or negative sheet index', async () => {
      xlsx.readFile.mockReturnValue({
        SheetNames: ['Sheet1', 'Sheet2'],
        Sheets: {
          Sheet1: {},
          Sheet2: {},
        },
      });

      await expect(parseXlsxFile('test.xlsx#0')).rejects.toThrow(
        'Sheet index 0 is out of range. Available sheets: 2 (1-2)',
      );
    });
  });

  describe('data validation', () => {
    it('should throw error for empty sheet', async () => {
      xlsx.readFile.mockReturnValue({
        SheetNames: ['EmptySheet'],
        Sheets: {
          EmptySheet: {},
        },
      });

      xlsx.utils.sheet_to_json.mockReturnValue([]);

      await expect(parseXlsxFile('test.xlsx#EmptySheet')).rejects.toThrow(
        'Sheet "EmptySheet" is empty or contains no valid data rows',
      );
    });

    it('should throw error for sheet with no headers', async () => {
      xlsx.readFile.mockReturnValue({
        SheetNames: ['NoHeaders'],
        Sheets: {
          NoHeaders: {},
        },
      });

      xlsx.utils.sheet_to_json.mockReturnValue([{}]);

      await expect(parseXlsxFile('test.xlsx#NoHeaders')).rejects.toThrow(
        'Sheet "NoHeaders" has no valid column headers',
      );
    });

    it('should throw error for sheet with only empty data', async () => {
      xlsx.readFile.mockReturnValue({
        SheetNames: ['EmptyData'],
        Sheets: {
          EmptyData: {},
        },
      });

      xlsx.utils.sheet_to_json.mockReturnValue([
        { col1: '', col2: '' },
        { col1: '   ', col2: '' },
        { col1: '', col2: '  ' },
      ]);

      await expect(parseXlsxFile('test.xlsx#EmptyData')).rejects.toThrow(
        'Sheet "EmptyData" contains only empty data. Please ensure the sheet has both headers and data rows.',
      );
    });

    it('should accept sheet with some valid data', async () => {
      const mockData = [
        { col1: '', col2: 'valid data' },
        { col1: '   ', col2: '' },
      ];

      xlsx.readFile.mockReturnValue({
        SheetNames: ['ValidData'],
        Sheets: {
          ValidData: {},
        },
      });

      xlsx.utils.sheet_to_json.mockReturnValue(mockData);

      const result = await parseXlsxFile('test.xlsx#ValidData');
      expect(result).toEqual(mockData);
    });
  });
});
