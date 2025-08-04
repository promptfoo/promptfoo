import * as fs from 'fs/promises';

import { processJsonlFile } from '../../../src/prompts/processors/jsonl';

jest.mock('fs/promises');

describe('processJsonlFile', () => {
  const mockReadFile = jest.mocked(fs.readFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid JSONL file without a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}]\n[{"key2": "value2"}]';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processJsonlFile(filePath, {})).toEqual([
      {
        raw: '[{"key1": "value1"}]',
        label: 'file.jsonl: [{"key1": "value1"}]',
      },
      {
        raw: '[{"key2": "value2"}]',
        label: 'file.jsonl: [{"key2": "value2"}]',
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a valid JSONL file with a single record without a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}, {"key2": "value2"}]';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processJsonlFile(filePath, {})).toEqual([
      {
        raw: '[{"key1": "value1"}, {"key2": "value2"}]',
        label: `file.jsonl`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a valid JSONL file with a single record and a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}, {"key2": "value2"}]';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processJsonlFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: '[{"key1": "value1"}, {"key2": "value2"}]',
        label: `Label`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a valid JSONL file with multiple records and a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}]\n[{"key2": "value2"}]';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processJsonlFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: '[{"key1": "value1"}]',
        label: `Label: [{"key1": "value1"}]`,
      },
      {
        raw: '[{"key2": "value2"}]',
        label: `Label: [{"key2": "value2"}]`,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.jsonl';
    mockReadFile.mockRejectedValue(new Error('File not found'));

    await expect(processJsonlFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf-8');
  });
});
