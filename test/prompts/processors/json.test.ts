import * as fs from 'fs';
import { processJsonFile } from '../../../src/prompts/processors/json';

jest.mock('fs');

describe('processJsonFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid JSON file without a label', () => {
    const filePath = 'file.json';
    const fileContent = JSON.stringify({ key: 'value' });
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processJsonFile(filePath, {})).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent}`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a valid JSON file with a label', () => {
    const filePath = 'file.json';
    const fileContent = JSON.stringify({ key: 'value' });
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processJsonFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: fileContent,
        label: `Label`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', () => {
    const filePath = 'nonexistent.json';
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    expect(() => processJsonFile(filePath, {})).toThrow('File not found');
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });
});
