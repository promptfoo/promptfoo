import * as fs from 'fs/promises';

import dedent from 'dedent';
import logger from '../../../src/logger';
import { processYamlFile } from '../../../src/prompts/processors/yaml';

jest.mock('fs/promises');

describe('processYamlFile', () => {
  const mockReadFile = jest.mocked(fs.readFile);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(logger.debug).mockClear();
  });

  it('should process a valid YAML file without a label', async () => {
    const filePath = 'file.yaml';
    const fileContent = 'key: value';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processYamlFile(filePath, {})).toEqual([
      {
        raw: JSON.stringify({ key: 'value' }),
        label: `${filePath}: ${JSON.stringify({ key: 'value' })}`,
        config: undefined,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should process a valid YAML file with a label', async () => {
    const filePath = 'file.yaml';
    const fileContent = 'key: value';
    mockReadFile.mockResolvedValue(fileContent);
    expect(await processYamlFile(filePath, { label: 'Label' })).toEqual([
      {
        raw: JSON.stringify({ key: 'value' }),
        label: 'Label',
        config: undefined,
      },
    ]);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.yaml';
    mockReadFile.mockRejectedValue(new Error('File not found'));

    await expect(processYamlFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should parse YAML and return stringified JSON', async () => {
    const filePath = 'file.yaml';
    const fileContent = `
key1: value1
key2: value2
    `;
    const expectedJson = JSON.stringify({ key1: 'value1', key2: 'value2' });

    mockReadFile.mockResolvedValue(fileContent);

    const result = await processYamlFile(filePath, {});
    expect(result[0].raw).toBe(expectedJson);
    expect(mockReadFile).toHaveBeenCalledWith(filePath, 'utf8');
  });

  it('should handle YAML with nested structures', async () => {
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

    mockReadFile.mockResolvedValue(fileContent);

    const result = await processYamlFile(filePath, {});
    expect(result[0].raw).toBe(expectedJson);
  });

  it('should handle YAML with whitespace in values', async () => {
    const filePath = 'file.yaml';
    const fileContent = `
key: "value with    spaces"
template: "{{ variable }}   "
    `;
    const expectedJson = JSON.stringify({
      key: 'value with    spaces',
      template: '{{ variable }}   ',
    });

    mockReadFile.mockResolvedValue(fileContent);

    const result = await processYamlFile(filePath, {});
    expect(result[0].raw).toBe(expectedJson);
  });

  it('should handle invalid YAML and return raw file contents', async () => {
    const filePath = 'issue-2368.yaml';
    const fileContent = dedent`
    {% import "system_prompt.yaml" as system_prompt %}
    {% import "user_prompt.yaml" as user_prompt %}
    {{ system_prompt.system_prompt() }}
    {{ user_prompt.user_prompt(example) }}`;

    mockReadFile.mockResolvedValue(fileContent);

    expect(await processYamlFile(filePath, {})).toEqual([
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
