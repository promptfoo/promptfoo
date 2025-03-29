import * as fs from 'fs';
import yaml from 'js-yaml';
import { processYamlFile } from '../../../src/prompts/processors/yaml';
import { loadFile } from '../../../src/util/fileLoader';

// Mock the fileLoader module
jest.mock('../../../src/util/fileLoader', () => ({
  __esModule: true,
  loadFile: jest.fn(),
}));

jest.mock('fs');
jest.mock('js-yaml');

describe('processYamlFile', () => {
  const _mockReadFileSync = jest.mocked(fs.readFileSync);
  const _mockYamlLoad = jest.mocked(yaml.load);
  const mockLoadFileImpl = jest.mocked(loadFile);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should process a valid YAML file without a label', async () => {
    const filePath = 'file.yaml';
    const parsedContent = { key: 'value' };
    mockLoadFileImpl.mockResolvedValue(parsedContent);

    await expect(processYamlFile(filePath, {})).resolves.toEqual([
      {
        raw: JSON.stringify(parsedContent),
        label: `${filePath}: ${JSON.stringify(parsedContent)}`,
        config: undefined,
      },
    ]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should process a valid YAML file with a label', async () => {
    const filePath = 'file.yaml';
    const parsedContent = { key: 'value' };
    mockLoadFileImpl.mockResolvedValue(parsedContent);

    await expect(processYamlFile(filePath, { label: 'Label' })).resolves.toEqual([
      {
        raw: JSON.stringify(parsedContent),
        label: 'Label',
        config: undefined,
      },
    ]);
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should throw an error if the file cannot be read', async () => {
    const filePath = 'nonexistent.yaml';
    mockLoadFileImpl.mockRejectedValue(new Error('File not found'));

    await expect(processYamlFile(filePath, {})).rejects.toThrow('File not found');
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should parse YAML and return stringified JSON', async () => {
    const filePath = 'test.yaml';
    const parsedContent = { name: 'John', age: 30 };
    mockLoadFileImpl.mockResolvedValue(parsedContent);

    const result = await processYamlFile(filePath, {});
    expect(result[0].raw).toBe(JSON.stringify(parsedContent));
    expect(mockLoadFileImpl).toHaveBeenCalledWith(filePath);
  });

  it('should handle YAML with nested structures', async () => {
    const filePath = 'test.yaml';
    const parsedContent = {
      person: {
        name: 'John',
        details: {
          age: 30,
          occupation: 'Developer',
        },
      },
    };
    mockLoadFileImpl.mockResolvedValue(parsedContent);

    const result = await processYamlFile(filePath, {});
    expect(result[0].raw).toBe(JSON.stringify(parsedContent));
  });

  it('should handle YAML with whitespace in values', async () => {
    const filePath = 'test.yaml';
    const parsedContent = {
      description: 'This is a test with    whitespace',
      multiline: 'Line 1\nLine 2\n  Line 3 with spaces',
    };
    mockLoadFileImpl.mockResolvedValue(parsedContent);

    const result = await processYamlFile(filePath, {});
    expect(result[0].raw).toBe(JSON.stringify(parsedContent));
  });

  it('should handle invalid YAML and return raw file contents', async () => {
    const filePath = 'issue-2368.yaml';
    const fileContent = `{% import "system_prompt.yaml" as system_prompt %}
    {% import "user_prompt.yaml" as user_prompt %}
    {{ system_prompt.system_prompt() }}
    {{ user_prompt.user_prompt(example) }}`;

    mockLoadFileImpl.mockResolvedValue(fileContent);

    await expect(processYamlFile(filePath, {})).resolves.toEqual([
      {
        raw: fileContent,
        label: `${filePath}: ${fileContent.slice(0, 80)}`,
        config: undefined,
      },
    ]);
  });
});
