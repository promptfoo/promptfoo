import * as fs from 'fs';
import { processJsonlFile } from '../../../src/prompts/processors/jsonl';

jest.mock('fs');

describe('processJsonlFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid JSONL file without a label', () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}]\n[{"key2": "value2"}]';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processJsonlFile(filePath, {})).toEqual([
      {
        raw: '[{"key1": "value1"}]',
        label: 'file.jsonl: [{"key1": "value1"}]',
      },
      {
        raw: '[{"key2": "value2"}]',
        label: 'file.jsonl: [{"key2": "value2"}]',
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a valid JSONL file with a single record without a label', () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}, {"key2": "value2"}]';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processJsonlFile(filePath, {})).toEqual([
      {
        raw: '[{"key1": "value1"}, {"key2": "value2"}]',
        label: `file.jsonl`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a valid JSONL file with a single record and a label', () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}, {"key2": "value2"}]';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processJsonlFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: '[{"key1": "value1"}, {"key2": "value2"}]',
        label: `Label`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should process a valid JSONL file with multiple records and a label', () => {
    const filePath = 'file.jsonl';
    const fileContent = '[{"key1": "value1"}]\n[{"key2": "value2"}]';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processJsonlFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: '[{"key1": "value1"}]',
        label: `Label: [{"key1": "value1"}]`,
      },
      {
        raw: '[{"key2": "value2"}]',
        label: `Label: [{"key2": "value2"}]`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });

  it('should throw an error if the file cannot be read', () => {
    const filePath = 'nonexistent.jsonl';
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
    expect(() => processJsonlFile(filePath, {})).toThrow('File not found');
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf-8');
  });
});
