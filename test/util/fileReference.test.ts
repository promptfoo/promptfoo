import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import type { Logger } from 'winston';
import * as esmModule from '../../src/esm';
import logger from '../../src/logger';
import * as pythonUtils from '../../src/python/pythonUtils';
import { isJavascriptFile } from '../../src/util/file';
import { loadFileReference, processConfigFileReferences } from '../../src/util/fileReference';

// Create mock implementations
jest.mock('fs');
jest.mock('path');
jest.mock('js-yaml');
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));
jest.mock('../../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));
jest.mock('../../src/util/file');
jest.mock('../../src/logger');

// Get the mocked functions with proper typing
const importModule = jest.mocked(esmModule.importModule);
const runPython = jest.mocked(pythonUtils.runPython);

describe('fileReference utility functions', () => {
  // Setup common mocks and spies
  beforeEach(() => {
    jest.resetAllMocks();

    // Mock logger methods
    jest.mocked(logger.debug).mockImplementation((message: string) => {
      return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger;
    });

    jest.mocked(logger.error).mockImplementation((message: string) => {
      return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      } as unknown as Logger;
    });

    // Mock path.resolve to return deterministic paths
    jest
      .mocked(path.resolve)
      .mockImplementation((basePath, filePath) =>
        filePath?.startsWith('/') ? filePath : path.join(basePath || '', filePath || ''),
      );

    // Mock path.join
    jest.mocked(path.join).mockImplementation((...parts) => parts.filter(Boolean).join('/'));

    // Mock path.extname to return file extensions
    jest.mocked(path.extname).mockImplementation((filePath) => {
      if (!filePath) {
        return '';
      }
      const parts = filePath.split('.');
      return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
    });

    // Mock isJavascriptFile to identify JavaScript files
    jest.mocked(isJavascriptFile).mockImplementation((filePath) => {
      if (!filePath) {
        return false;
      }
      return ['.js', '.mjs', '.ts', '.cjs'].some((ext) => filePath.endsWith(ext));
    });

    // Set up default mock implementations
    importModule.mockResolvedValue({});
    runPython.mockResolvedValue({});
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

    it('should throw an error for unsupported file types', async () => {
      // Arrange
      const fileRef = 'file:///path/to/file.xyz';

      // Ensure the mocks handle this case correctly
      jest.mocked(path.extname).mockReturnValue('.xyz');
      jest.mocked(isJavascriptFile).mockReturnValue(false);

      // Act & Assert
      await expect(loadFileReference(fileRef)).rejects.toThrow('Unsupported file extension: .xyz');
    });
  });

  describe('processConfigFileReferences', () => {
    it('should return primitive values as is', async () => {
      // Act & Assert
      await expect(processConfigFileReferences(42)).resolves.toBe(42);
      await expect(processConfigFileReferences('test')).resolves.toBe('test');
      await expect(processConfigFileReferences(true)).resolves.toBe(true);
      await expect(processConfigFileReferences(null)).resolves.toBeNull();
      await expect(processConfigFileReferences(undefined)).resolves.toBeUndefined();
    });

    it('should process a simple file reference string', async () => {
      // Arrange
      const config = 'file:///path/to/config.json';
      const parsedContent = { name: 'test', value: 42 };

      // Setup mocks
      jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(parsedContent));
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

      // Setup mocks
      jest.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/setting2.json') {
          return '{"key": "value2"}';
        }
        if (path === '/path/to/setting3.yaml') {
          return 'key: value3';
        }
        return '';
      });

      jest.spyOn(JSON, 'parse').mockImplementation((content) => {
        if (content === '{"key": "value2"}') {
          return { key: 'value2' };
        }
        return {};
      });

      jest.mocked(yaml.load).mockImplementation((content) => {
        if (content === 'key: value3') {
          return { key: 'value3' };
        }
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

      // Setup mocks
      jest.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/item1.json') {
          return '{"name": "item1"}';
        }
        if (path === '/path/to/item2.yaml') {
          return 'name: item2';
        }
        return '';
      });

      jest.spyOn(JSON, 'parse').mockImplementation((content) => {
        if (content === '{"name": "item1"}') {
          return { name: 'item1' };
        }
        return {};
      });

      jest.mocked(yaml.load).mockImplementation((content) => {
        if (content === 'name: item2') {
          return { name: 'item2' };
        }
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

      // Setup mocks
      jest.mocked(fs.readFileSync).mockImplementation((path) => {
        if (path === '/path/to/nonexistent.json') {
          throw new Error('File not found');
        }
        return '';
      });

      // Act & Assert
      await expect(processConfigFileReferences(config)).rejects.toThrow('File not found');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('File not found'));
    });
  });
});
