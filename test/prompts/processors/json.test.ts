import * as fs from 'fs';

import { processJsonFile } from '../../../src/prompts/processors/json';
import * as fileModule from '../../../src/util/file';

jest.mock('fs');
jest.mock('../../../src/util/file');

describe('processJsonFile', () => {
  const mockReadFileSync = jest.mocked(fs.readFileSync);
  const mockMaybeLoadConfigFromExternalFile = jest.mocked(
    fileModule.maybeLoadConfigFromExternalFile,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    // By default, maybeLoadConfigFromExternalFile returns its input unchanged
    mockMaybeLoadConfigFromExternalFile.mockImplementation((input) => input);
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

  describe('recursive file:// resolution', () => {
    it('should recursively resolve file:// references in JSON content', () => {
      const filePath = 'conversation.json';
      const fileContent = JSON.stringify([
        { role: 'system', content: 'file://system.md' },
        { role: 'user', content: 'file://user.md' },
      ]);

      const parsedJson = [
        { role: 'system', content: 'file://system.md' },
        { role: 'user', content: 'file://user.md' },
      ];

      const resolvedContent = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is 2 + 2?' },
      ];

      mockReadFileSync.mockReturnValue(fileContent);
      mockMaybeLoadConfigFromExternalFile.mockReturnValue(resolvedContent);

      const result = processJsonFile(filePath, {});

      expect(mockMaybeLoadConfigFromExternalFile).toHaveBeenCalledWith(parsedJson);
      expect(result[0].raw).toBe(JSON.stringify(resolvedContent));
    });

    it('should handle nested file:// references in complex JSON structures', () => {
      const filePath = 'config.json';
      const fileContent = JSON.stringify({
        provider: {
          id: 'openai:gpt-4',
          config: {
            temperature: 'file://temperature.json',
            tools: 'file://tools.json',
          },
        },
        messages: [{ role: 'system', content: 'file://system.txt' }],
      });

      const parsedJson = {
        provider: {
          id: 'openai:gpt-4',
          config: {
            temperature: 'file://temperature.json',
            tools: 'file://tools.json',
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

      const result = processJsonFile(filePath, {});

      expect(mockMaybeLoadConfigFromExternalFile).toHaveBeenCalledWith(parsedJson);
      expect(result[0].raw).toBe(JSON.stringify(resolvedContent));
    });

    it('should handle invalid JSON and return original content', () => {
      const filePath = 'invalid.json';
      const fileContent = 'This is not valid JSON {]';

      mockReadFileSync.mockReturnValue(fileContent);

      const result = processJsonFile(filePath, {});

      // When JSON parsing fails, it should return the original content
      expect(mockMaybeLoadConfigFromExternalFile).not.toHaveBeenCalled();
      expect(result[0].raw).toBe(fileContent);
    });

    it('should handle when maybeLoadConfigFromExternalFile returns unchanged content', () => {
      const filePath = 'no-refs.json';
      const fileContent = JSON.stringify({ key1: 'value1', key2: 'value2' });

      const parsedJson = { key1: 'value1', key2: 'value2' };

      mockReadFileSync.mockReturnValue(fileContent);
      mockMaybeLoadConfigFromExternalFile.mockReturnValue(parsedJson);

      const result = processJsonFile(filePath, {});

      expect(mockMaybeLoadConfigFromExternalFile).toHaveBeenCalledWith(parsedJson);
      expect(result[0].raw).toBe(JSON.stringify(parsedJson));
    });
  });
});
