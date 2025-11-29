import * as fs from 'fs';

import dedent from 'dedent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { processYamlFile } from '../../../src/prompts/processors/yaml';
import * as fileModule from '../../../src/util/file';

vi.mock('fs');
vi.mock('../../../src/util/file');
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('processYamlFile', () => {
  const mockReadFileSync = vi.mocked(fs.readFileSync);
  const mockMaybeLoadConfigFromExternalFile = vi.mocked(fileModule.maybeLoadConfigFromExternalFile);

  beforeEach(() => {
    vi.clearAllMocks();
    // By default, maybeLoadConfigFromExternalFile returns its input unchanged
    mockMaybeLoadConfigFromExternalFile.mockImplementation((input) => input);
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

  describe('recursive file:// resolution', () => {
    it('should recursively resolve file:// references in YAML content', () => {
      const filePath = 'conversation.yaml';
      const fileContent = dedent`
        - role: system
          content: file://system.md
        - role: user
          content: file://user.md
      `;

      const parsedYaml = [
        { role: 'system', content: 'file://system.md' },
        { role: 'user', content: 'file://user.md' },
      ];

      const resolvedContent = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is 2 + 2?' },
      ];

      mockReadFileSync.mockReturnValue(fileContent);
      mockMaybeLoadConfigFromExternalFile.mockReturnValue(resolvedContent);

      const result = processYamlFile(filePath, {});

      expect(mockMaybeLoadConfigFromExternalFile).toHaveBeenCalledWith(parsedYaml);
      expect(result[0].raw).toBe(JSON.stringify(resolvedContent));
    });

    it('should handle nested file:// references in complex structures', () => {
      const filePath = 'config.yaml';
      const fileContent = dedent`
        provider:
          id: openai:gpt-4
          config:
            temperature: file://temperature.json
            tools: file://tools.yaml
        messages:
          - role: system
            content: file://system.txt
      `;

      const parsedYaml = {
        provider: {
          id: 'openai:gpt-4',
          config: {
            temperature: 'file://temperature.json',
            tools: 'file://tools.yaml',
          },
        },
        messages: [{ role: 'system', content: 'file://system.txt' }],
      };

      const resolvedContent = {
        provider: {
          id: 'openai:gpt-4',
          config: {
            temperature: 0.7,
            tools: [{ name: 'search', description: 'Search the web' }],
          },
        },
        messages: [{ role: 'system', content: 'You are a helpful assistant.' }],
      };

      mockReadFileSync.mockReturnValue(fileContent);
      mockMaybeLoadConfigFromExternalFile.mockReturnValue(resolvedContent);

      const result = processYamlFile(filePath, {});

      expect(mockMaybeLoadConfigFromExternalFile).toHaveBeenCalledWith(parsedYaml);
      expect(result[0].raw).toBe(JSON.stringify(resolvedContent));
    });

    it('should handle when maybeLoadConfigFromExternalFile returns unchanged content', () => {
      const filePath = 'no-refs.yaml';
      const fileContent = dedent`
        key1: value1
        key2: value2
      `;

      const parsedYaml = { key1: 'value1', key2: 'value2' };

      mockReadFileSync.mockReturnValue(fileContent);
      mockMaybeLoadConfigFromExternalFile.mockReturnValue(parsedYaml);

      const result = processYamlFile(filePath, {});

      expect(mockMaybeLoadConfigFromExternalFile).toHaveBeenCalledWith(parsedYaml);
      expect(result[0].raw).toBe(JSON.stringify(parsedYaml));
    });
  });
});
