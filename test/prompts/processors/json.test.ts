import * as fs from 'fs/promises';

import { processJsonFile } from '../../../src/prompts/processors/json';

jest.mock('fs/promises');

describe('processJsonFile', () => {
  const mockReadFile = jest.mocked(fs.readFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid JSON file without a label', async () => {
    const filePath = 'file.json';
    const fileContent = JSON.stringify({ key: 'value' });
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processJsonFile(filePath, {})).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent}`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a valid JSON file with a label', async () => {
    const filePath = 'file.json';
    const fileContent = JSON.stringify({ key: 'value' });
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processJsonFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: fileContent,
        label: `Label`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.json';
    mockReadFile.mockRejectedValue(new Error('File not found'));

    await expect(processJsonFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });
});
