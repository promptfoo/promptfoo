import dedent from 'dedent';
import * as fs from 'fs';
import logger from '../../../src/logger';
import { processYamlFile } from '../../../src/prompts/processors/yaml';

jest.mock('fs');

describe('processYamlFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(logger.debug).mockClear();
  });

  it('should process a valid YAML file without a label', () => {
    const filePath = 'file.yaml';
    const fileContent = 'key: value';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processYamlFile(filePath, {})).toEqual([
      {
        raw: JSON.stringify({ key: 'value' }),
        label: `${filePath}: ${JSON.stringify({ key: 'value' })}`,
        config: undefined,
      },
    ]);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a valid YAML file with a label', () => {
    const filePath = 'file.yaml';
    const fileContent = 'key: value';
    mockReadFileSync.mockReturnValue(fileContent);
    expect(processYamlFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: JSON.stringify({ key: 'value' }),
        label: 'Label',
        config: undefined,
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

  it('should parse YAML and return stringified JSON', () => {
    const filePath = 'file.yaml';
    const fileContent = `
key1: value1
key2: value2
    `;
    const expectedJson = JSON.stringify({ key1: 'value1', key2: 'value2' });

    mockReadFileSync.mockReturnValue(fileContent);

    const result = processYamlFile(filePath, {});
    expect(result[0].raw).toBe(expectedJson);
    expect(mockReadFileSync).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should handle YAML with nested structures', () => {
    const filePath = 'file.yaml';
    const fileContent = `
parent:
  child1: value1
  child2: value2
array:
  - item1
  - item2
    `;
    const expectedJson = JSON.stringify({
      parent: { child1: 'value1', child2: 'value2' },
      array: ['item1', 'item2'],
    });

    mockReadFileSync.mockReturnValue(fileContent);

    const result = processYamlFile(filePath, {});
    expect(result[0].raw).toBe(expectedJson);
  });

  it('should handle YAML with whitespace in values', () => {
    const filePath = 'file.yaml';
    const fileContent = `
key: "value with    spaces"
template: "{{ variable }}   "
    `;
    const expectedJson = JSON.stringify({
      key: 'value with    spaces',
      template: '{{ variable }}   ',
    });

    mockReadFileSync.mockReturnValue(fileContent);

    const result = processYamlFile(filePath, {});
    expect(result[0].raw).toBe(expectedJson);
  });

  it('should handle invalid YAML and return raw file contents', () => {
    const filePath = 'issue-2368.yaml';
    const fileContent = dedent`
    {% import "system_prompt.yaml" as system_prompt %}
    {% import "user_prompt.yaml" as user_prompt %}
    {{ system_prompt.system_prompt() }}
    {{ user_prompt.user_prompt(example) }}`;

    mockReadFileSync.mockReturnValue(fileContent);

    expect(processYamlFile(filePath, {})).toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 80)}`,
        config: undefined,
      },
    ]);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/Error parsing YAML file issue-2368\.yaml:/),
    );
  });
});
