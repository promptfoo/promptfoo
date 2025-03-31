import * as fs from 'fs';
import { processJsonlFile } from '../../../src/prompts/processors/jsonl';
import { loadFile } from '../../../src/util/fileLoader';

jest.mock('fs');
jest.mock('../../../src/util/fileLoader', () => ({
  loadFile: jest.fn(),
}));

describe('processJsonlFile', () => {
  const mockLoadFile = jest.mocked(loadFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid JSONL file without a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}]\n[{"key2": "value2"}]';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJsonlFile(filePath, {});

    expect(result).toEqual([
      {
        raw: '[{"key1": "value1"}]',
        label: 'file.jsonl: [{"key1": "value1"}]',
        config: undefined,
      },
      {
        raw: '[{"key2": "value2"}]',
        label: 'file.jsonl: [{"key2": "value2"}]',
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should process a valid JSONL file with a single record without a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}, {"key2": "value2"}]';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJsonlFile(filePath, {});

    expect(result).toEqual([
      {
        raw: '[{"key1": "value1"}, {"key2": "value2"}]',
        label: `file.jsonl`,
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should process a valid JSONL file with a single record and a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}, {"key2": "value2"}]';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJsonlFile(filePath, { label: 'Label' });

    expect(result).toEqual([
      {
        raw: '[{"key1": "value1"}, {"key2": "value2"}]',
        label: `Label`,
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should process a valid JSONL file with multiple records and a label', async () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}]\n[{"key2": "value2"}]';
    mockLoadFile.mockResolvedValue(fileContent);

    const result = await processJsonlFile(filePath, { label: 'Label' });

    expect(result).toEqual([
      {
        raw: '[{"key1": "value1"}]',
        label: `Label: [{"key1": "value1"}]`,
        config: undefined,
      },
      {
        raw: '[{"key2": "value2"}]',
        label: `Label: [{"key2": "value2"}]`,
        config: undefined,
      },
    ]);
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.jsonl';
    mockLoadFile.mockRejectedValue(new Error('File not found'));

    await expect(processJsonlFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockLoadFile).toHaveBeenCalledWith(filePath);
  });
});
