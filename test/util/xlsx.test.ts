import { parseXlsxFile } from '../../src/util/xlsx';

jest.mock('xlsx', () => ({
  readFile: jest.fn(),
  utils: {
    sheet_to_json: jest.fn(),
  },
}));

describe('parseXlsxFile', () => {
  let xlsx: any;

  beforeEach(async () => {
    xlsx = await import('xlsx');
    jest.resetAllMocks();
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

    const result = await parseXlsxFile('test.xlsx');

    expect(result).toEqual([]);
  });

  it('should use first sheet by default', async () => {
    xlsx.readFile.mockReturnValue({
      SheetNames: ['Sheet1', 'Sheet2'],
      Sheets: {
        Sheet1: {},
        Sheet2: {},
      },
    });

    xlsx.utils.sheet_to_json.mockReturnValue([]);

    await parseXlsxFile('test.xlsx');

    expect(xlsx.utils.sheet_to_json).toHaveBeenCalledWith({}, { defval: '' });
  });
});
