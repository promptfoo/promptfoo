import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { Logger } from 'winston';
import * as esmModule from '../src/esm';
import logger from '../src/logger';
import * as pythonUtils from '../src/python/pythonUtils';
import { isJavascriptFile } from '../src/util/file';
import { loadFileReference, processConfigFileReferences } from '../src/util/fileReference';

// Create proper mock implementations
jest.mock('fs');
jest.mock('path');
jest.mock('js-yaml');
jest.mock('../src/esm', () => ({
  importModule: jest.fn(),
}));
jest.mock('../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));
jest.mock('../src/util/file');
jest.mock('../src/logger');

// Get the mocked functions with proper typing
const importModule = jest.mocked(esmModule.importModule);
const runPython = jest.mocked(pythonUtils.runPython);

describe('fileReference utility functions', () => {
  // Setup common mocks and spies
  beforeEach(() => {
    jest.resetAllMocks();

    // Mock logger methods with jest.fn()
    (logger.debug as jest.Mock).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as unknown as Logger,
    );

    (logger.error as jest.Mock).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as unknown as Logger,
    );

    // Mock path.resolve to return deterministic paths
    jest
      .mocked(path.resolve)
      .mockImplementation((basePath, filePath) =>
        filePath?.startsWith('/') ? filePath : path.join(basePath || '', filePath || ''),
      );

    // Mock path.join
    jest.mocked(path.join).mockImplementation((...parts) => parts.filter(Boolean).join('/'));

    // Mock path.extname to return file extensions - safely handle undefined
    jest.mocked(path.extname).mockImplementation((filePath) => {
      if (!filePath) return '';
      const parts = filePath.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    });

    // Mock isJavascriptFile to identify JavaScript files - safely handle undefined
    jest.mocked(isJavascriptFile).mockImplementation((filePath) => {
      if (!filePath) return false;
      return ['.js', '.mjs', '.ts', '.cjs'].some((ext) => filePath.endsWith(ext));
    });

    // Set up default mock implementations
    importModule.mockResolvedValue({});
    runPython.mockResolvedValue({});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('loadFileReference', () => {
    it('should load JSON files correctly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/config.json';
      const fileContent = '{"name": "test", "value": 42}';
      const parsedContent = { name: 'test', value: 42 };

      jest.mocked(fs.readFileSync).mockReturnValue(fileContent);
      jest.spyOn(JSON, 'parse').mockReturnValue(parsedContent);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/config.json', 'utf8');
      expect(result).toEqual(parsedContent);
    });

    it('should load YAML files correctly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/config.yaml';
      const fileContent = 'name: test\nvalue: 42';
      const parsedContent = { name: 'test', value: 42 };

      jest.mocked(fs.readFileSync).mockReturnValue(fileContent);
      jest.mocked(yaml.load).mockReturnValue(parsedContent);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/config.yaml', 'utf8');
      expect(yaml.load).toHaveBeenCalledWith(fileContent);
      expect(result).toEqual(parsedContent);
    });

    it('should load JavaScript files correctly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/config.js';
      const moduleOutput = { settings: { temperature: 0.7 } };

      jest.mocked(isJavascriptFile).mockReturnValue(true);
      importModule.mockResolvedValue(moduleOutput);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(importModule).toHaveBeenCalledWith('/path/to/config.js', undefined);
      expect(result).toEqual(moduleOutput);
    });

    it('should execute JavaScript function if module is a function', async () => {
      // Arrange
      const fileRef = 'file:///path/to/function.js';
      const moduleFunction = jest.fn().mockReturnValue({ dynamic: true });

      jest.mocked(isJavascriptFile).mockReturnValue(true);
      importModule.mockResolvedValue(moduleFunction);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(importModule).toHaveBeenCalledWith('/path/to/function.js', undefined);
      expect(moduleFunction).toHaveBeenCalled();
      expect(result).toEqual({ dynamic: true });
    });

    it('should load JavaScript files with function name correctly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/config.js:getConfig';
      const moduleOutput = { getConfig: 'success' };

      jest.mocked(isJavascriptFile).mockReturnValue(true);
      importModule.mockResolvedValue(moduleOutput);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(importModule).toHaveBeenCalledWith('/path/to/config.js', 'getConfig');
      expect(result).toEqual(moduleOutput);
    });

    it('should load Python files correctly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/config.py';
      const pythonOutput = { message: 'Hello from Python' };

      runPython.mockResolvedValue(pythonOutput);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(runPython).toHaveBeenCalledWith('/path/to/config.py', 'get_config', []);
      expect(result).toEqual(pythonOutput);
    });

    it('should load Python files with function name correctly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/config.py:custom_func';
      const pythonOutput = { custom: true };

      runPython.mockResolvedValue(pythonOutput);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(runPython).toHaveBeenCalledWith('/path/to/config.py', 'custom_func', []);
      expect(result).toEqual(pythonOutput);
    });

    it('should load text files correctly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/config.txt';
      const fileContent = 'This is a text file';

      jest.mocked(fs.readFileSync).mockReturnValue(fileContent);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/config.txt', 'utf8');
      expect(result).toEqual(fileContent);
    });

    it('should load markdown files as text', async () => {
      // Arrange
      const fileRef = 'file:///path/to/readme.md';
      const fileContent = '# Markdown Content';

      jest.mocked(fs.readFileSync).mockReturnValue(fileContent);

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/readme.md', 'utf8');
      expect(result).toEqual(fileContent);
    });

    it('should handle files with no extension as text', async () => {
      // Arrange
      const fileRef = 'file:///path/to/noextension';
      const fileContent = 'File with no extension';

      jest.mocked(fs.readFileSync).mockReturnValue(fileContent);
      jest.mocked(path.extname).mockReturnValue('');

      // Act
      const result = await loadFileReference(fileRef);

      // Assert
      expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/noextension', 'utf8');
      expect(result).toEqual(fileContent);
    });

    it('should throw an error for unsupported file types', async () => {
      // Arrange
      const fileRef = 'file:///path/to/file.xyz';

      // Ensure the mocks handle this case correctly
      jest.mocked(path.extname).mockReturnValue('.xyz');
      jest.mocked(isJavascriptFile).mockReturnValue(false);

      // Act & Assert
      await expect(loadFileReference(fileRef)).rejects.toThrow('Unsupported file extension: .xyz');
    });

    it('should handle fs errors properly', async () => {
      // Arrange
      const fileRef = 'file:///path/to/nonexistent.json';
      const fsError = new Error('ENOENT: no such file or directory');

      jest.mocked(fs.readFileSync).mockImplementation(() => {
        throw fsError;
      });

      // Act & Assert
      await expect(loadFileReference(fileRef)).rejects.toThrow(fsError);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should resolve file paths relative to the basePath', async () => {
      // Arrange
      const fileRef = 'file://config.json';
      const basePath = '/base/path';
      const fileContent = '{"name": "test"}';
      const parsedContent = { name: 'test' };

      jest.mocked(path.resolve).mockReturnValue('/base/path/config.json');
      jest.mocked(fs.readFileSync).mockReturnValue(fileContent);
      jest.spyOn(JSON, 'parse').mockReturnValue(parsedContent);

      // Act
      const result = await loadFileReference(fileRef, basePath);

      // Assert
      expect(path.resolve).toHaveBeenCalledWith('/base/path', 'config.json');
      expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/config.json', 'utf8');
      expect(result).toEqual(parsedContent);
    });
  });

  describe('processConfigFileReferences', () => {
    it('should return null and undefined configs as is', async () => {
      // Act & Assert
      await expect(processConfigFileReferences(null)).resolves.toBeNull();
      await expect(processConfigFileReferences(undefined)).resolves.toBeUndefined();
    });

    it('should return primitive values as is', async () => {
      // Act & Assert
      await expect(processConfigFileReferences(42)).resolves.toBe(42);
      await expect(processConfigFileReferences('test')).resolves.toBe('test');
      await expect(processConfigFileReferences(true)).resolves.toBe(true);
      await expect(processConfigFileReferences(false)).resolves.toBe(false);
    });

    it('should process a simple file reference string', async () => {
      // Arrange
      const config = 'file:///path/to/config.json';
      const parsedContent = { name: 'test', value: 42 };

      // Mock fs.readFileSync for the JSON file
      jest.mocked(fs.readFileSync).mockReturnValue('{"name": "test", "value": 42}');
      jest.spyOn(JSON, 'parse').mockReturnValue(parsedContent);

      // Act
      const result = await processConfigFileReferences(config);

      // Assert
      expect(result).toEqual(parsedContent);
    });

    it('should process nested file references in objects', async () => {
      // Arrange
      const config = {
        setting1: 'value1',
        setting2: 'file:///path/to/setting2.json',
        nested: {
          setting3: 'file:///path/to/setting3.yaml',
        },
      };

      // Mock fs.readFileSync to return different values based on the path
      jest.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/setting2.json') return '{"key": "value2"}';
        if (path === '/path/to/setting3.yaml') return 'key: value3';
        return '';
      });

      // Use proper Jest mocking for JSON.parse
      const jsonParseSpy = jest.spyOn(JSON, 'parse');
      jsonParseSpy.mockImplementation((content) => {
        if (content === '{"key": "value2"}') return { key: 'value2' };
        return {};
      });

      jest.mocked(yaml.load).mockImplementation((content) => {
        if (content === 'key: value3') return { key: 'value3' };
        return {};
      });

      // Act
      const result = await processConfigFileReferences(config);

      // Assert
      expect(result).toEqual({
        setting1: 'value1',
        setting2: { key: 'value2' },
        nested: {
          setting3: { key: 'value3' },
        },
      });
    });

    it('should process file references in arrays', async () => {
      // Arrange
      const config = [
        'regular string',
        'file:///path/to/item1.json',
        'file:///path/to/item2.yaml',
        42,
      ];

      // Mock fs.readFileSync to return different values based on the path
      jest.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/item1.json') return '{"name": "item1"}';
        if (path === '/path/to/item2.yaml') return 'name: item2';
        return '';
      });

      // Use proper Jest mocking for JSON.parse
      const jsonParseSpy = jest.spyOn(JSON, 'parse');
      jsonParseSpy.mockImplementation((content) => {
        if (content === '{"name": "item1"}') return { name: 'item1' };
        return {};
      });

      jest.mocked(yaml.load).mockImplementation((content) => {
        if (content === 'name: item2') return { name: 'item2' };
        return {};
      });

      // Act
      const result = await processConfigFileReferences(config);

      // Assert
      expect(result).toEqual(['regular string', { name: 'item1' }, { name: 'item2' }, 42]);
    });

    it('should handle errors when processing file references', async () => {
      // Arrange
      const config = {
        valid: 'regular value',
        invalid: 'file:///path/to/nonexistent.json',
      };

      // Mock fs.readFileSync to throw an error for nonexistent.json
      jest.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/nonexistent.json') {
          throw new Error('File not found');
        }
        return '';
      });

      // Act & Assert
      await expect(processConfigFileReferences(config)).rejects.toThrow('File not found');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle complex nested structures with file references', async () => {
      // Arrange
      const config = {
        settings: {
          main: 'file:///path/to/main.json',
          advanced: [
            'file:///path/to/adv1.yaml',
            {
              sub: 'file:///path/to/sub.js',
            },
          ],
        },
      };

      // Mock the relevant functions with implementations specific to this test
      jest.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/main.json') return '{"temperature": 0.7}';
        if (path === '/path/to/adv1.yaml') return 'precision: high';
        return '';
      });

      // Use proper Jest mocking for JSON.parse
      const jsonParseSpy = jest.spyOn(JSON, 'parse');
      jsonParseSpy.mockImplementation((content) => {
        if (content === '{"temperature": 0.7}') return { temperature: 0.7 };
        return {};
      });

      jest.mocked(yaml.load).mockImplementation((content) => {
        if (content === 'precision: high') return { precision: 'high' };
        return {};
      });

      jest.mocked(isJavascriptFile).mockImplementation((path) => {
        return path === '/path/to/sub.js';
      });

      importModule.mockImplementation(async (path) => {
        if (path === '/path/to/sub.js') return { enabled: true };
        return {};
      });

      // Act
      const result = await processConfigFileReferences(config);

      // Assert
      expect(result).toEqual({
        settings: {
          main: { temperature: 0.7 },
          advanced: [
            { precision: 'high' },
            {
              sub: { enabled: true },
            },
          ],
        },
      });
    });

    it('should handle circular references gracefully', async () => {
      // Arrange
      const circular: any = { name: 'test' };
      circular.self = circular; // Create circular reference

      // Act
      const result = await processConfigFileReferences(circular);

      // Assert - should not crash and should maintain structure
      expect(result).toEqual(
        expect.objectContaining({
          name: 'test',
        }),
      );
      expect(result.self).toBe(result); // Should maintain circular reference
    });
  });
});
