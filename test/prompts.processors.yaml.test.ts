import * as fs from 'fs';
import { processYamlFile } from '../src/prompts/processors/yaml';

jest.mock('fs');

describe('processYamlFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid YAML file without a label', () => {
    const filePath = 'file.yaml';
    const fileContent = 'key: value';
    const parsedYaml = { key: 'value' };
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processYamlFile(filePath, {})).toEqual([
      {
        raw: JSON.stringify(parsedYaml),
        label: `${filePath}: ${fileContent}`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a valid YAML file with a label', () => {
    const filePath = 'file.yaml';
    const fileContent = 'key: value';
    const parsedYaml = { key: 'value' };
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processYamlFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: JSON.stringify(parsedYaml),
        label: `Label`,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', () => {
    const filePath = 'nonexistent.yaml';
    mockReadFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });

    expect(() => processYamlFile(filePath, {})).toThrow('File not found');
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the YAML content is invalid', () => {
    const filePath = 'invalid.yaml';
    const fileContent = 'invalid: yaml: content';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(() => processYamlFile(filePath, {})).toThrow(/bad indentation of a mapping entry/);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });
});
