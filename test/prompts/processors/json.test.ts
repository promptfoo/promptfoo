import * as fs from 'fs';
import { processJsonFile } from '../../../src/prompts/processors/json';
import { loadFile } from '../../../src/util/fileLoader';

// Mock the fileLoader module
jest.mock('../../../src/util/fileLoader', () => ({
  __esModule: true,
  loadFile: jest.fn(),
}));

jest.mock('fs');

describe('processJsonFile', () => {
  const _mockReadFileSync = jest.mocked(fs.readFileSync);
  const mockLoadFileImpl = jest.mocked(loadFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid JSON file without a label', async () => {
    const filePath = 'file.json';
    const fileContent = JSON.stringify({ key: 'value' });
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processJsonFile(filePath, {})).resolves.toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent}`,
      },
    ]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should process a valid JSON file with a label', async () => {
    const filePath = 'file.json';
    const fileContent = JSON.stringify({ key: 'value' });
    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processJsonFile(filePath, { label: 'Label' })).resolves.toEqual([
      {
        raw: fileContent,
        label: `Label`,
        config: undefined,
      },
    ]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.json';
    mockLoadFileImpl.mockRejectedValue(new Error('File not found'));

    await expect(processJsonFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });
});
