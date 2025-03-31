import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadFileReference, processConfigFileReferences } from '../../src/util/fileReference';

// Jest doesn't need explicit imports for describe, it, beforeEach, etc.

describe('fileReference utilities', () => {
  let tempDir: string;
  let testJsonPath: string;
  let testYamlPath: string;
  let testJsPath: string;
  let testPyPath: string;
  let testTxtPath: string;

  // Create temporary test files for each supported format
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-test-'));

    // Create test JSON file
    testJsonPath = path.join(tempDir, 'test-config.json');
    fs.writeFileSync(testJsonPath, JSON.stringify({ message: 'Hello from JSON', number: 42 }));

    // Create test YAML file
    testYamlPath = path.join(tempDir, 'test-config.yaml');
    fs.writeFileSync(testYamlPath, 'message: Hello from YAML\nlist:\n  - item1\n  - item2');

    // Create test JavaScript file
    testJsPath = path.join(tempDir, 'test-config.js');
    fs.writeFileSync(
      testJsPath,
      'module.exports = { message: "Hello from JS", getConfig: () => ({ dynamic: true }) };',
    );

    // Create test Python file
    testPyPath = path.join(tempDir, 'test-config.py');
    fs.writeFileSync(
      testPyPath,
      'def get_config():\n    return {"message": "Hello from Python", "list": [1, 2, 3]}\n',
    );

    // Create test text file
    testTxtPath = path.join(tempDir, 'test-config.txt');
    fs.writeFileSync(testTxtPath, 'Hello from plain text file');
  });

  // Clean up temporary files after tests
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('loadFileReference', () => {
    it('should load JSON files correctly', async () => {
      const result = await loadFileReference(`file://${testJsonPath}`);
      expect(result).toEqual({ message: 'Hello from JSON', number: 42 });
    });

    it('should load YAML files correctly', async () => {
      const result = await loadFileReference(`file://${testYamlPath}`);
      expect(result).toEqual({ message: 'Hello from YAML', list: ['item1', 'item2'] });
    });

    it('should load JavaScript files correctly', async () => {
      const result = await loadFileReference(`file://${testJsPath}`);
      expect(result).toEqual({ message: 'Hello from JS', getConfig: result.getConfig });
    });

    it('should load JavaScript files with specified function correctly', async () => {
      const result = await loadFileReference(`file://${testJsPath}:getConfig`);
      expect(result).toEqual({ dynamic: true });
    });

    it('should load text files correctly', async () => {
      const result = await loadFileReference(`file://${testTxtPath}`);
      expect(result).toBe('Hello from plain text file');
    });

    it('should throw an error for non-existent files', async () => {
      await expect(loadFileReference('file:///non-existent-file.json')).rejects.toThrow('ENOENT');
    });

    it('should throw an error for unsupported file types', async () => {
      const unsupportedPath = path.join(tempDir, 'unsupported.xyz');
      fs.writeFileSync(unsupportedPath, 'some content');

      await expect(loadFileReference(`file://${unsupportedPath}`)).rejects.toThrow(
        'Unsupported file extension',
      );
    });
  });

  describe('processConfigFileReferences', () => {
    it('should process string file references', async () => {
      const config = `file://${testJsonPath}`;
      const result = await processConfigFileReferences(config);
      expect(result).toEqual({ message: 'Hello from JSON', number: 42 });
    });

    it('should return primitive values as is', async () => {
      await expect(processConfigFileReferences(42)).resolves.toBe(42);
      await expect(processConfigFileReferences(true)).resolves.toBe(true);
      await expect(processConfigFileReferences(null)).resolves.toBeNull();
      await expect(processConfigFileReferences(undefined)).resolves.toBeUndefined();
    });

    it('should process arrays with file references', async () => {
      const config = [`file://${testJsonPath}`, `file://${testYamlPath}`, 'regular string'];

      const result = await processConfigFileReferences(config);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ message: 'Hello from JSON', number: 42 });
      expect(result[1]).toEqual({ message: 'Hello from YAML', list: ['item1', 'item2'] });
      expect(result[2]).toBe('regular string');
    });

    it('should process objects with file references', async () => {
      const config = {
        json: `file://${testJsonPath}`,
        yaml: `file://${testYamlPath}`,
        text: `file://${testTxtPath}`,
        normal: 'regular value',
        nested: {
          js: `file://${testJsPath}:getConfig`,
        },
      };

      const result = await processConfigFileReferences(config);

      expect(result).toBeInstanceOf(Object);
      expect(result.json).toEqual({ message: 'Hello from JSON', number: 42 });
      expect(result.yaml).toEqual({ message: 'Hello from YAML', list: ['item1', 'item2'] });
      expect(result.text).toBe('Hello from plain text file');
      expect(result.normal).toBe('regular value');
      expect(result.nested.js).toEqual({ dynamic: true });
    });

    it('should handle null or undefined config', async () => {
      await expect(processConfigFileReferences(null)).resolves.toBeNull();
      await expect(processConfigFileReferences(undefined)).resolves.toBeUndefined();
    });

    it('should handle circular references gracefully', async () => {
      const circular: any = { name: 'circular' };
      circular.self = circular;

      // This shouldn't hang or crash
      const result = await processConfigFileReferences(circular);
      expect(result).toBeInstanceOf(Object);
      expect(result.name).toBe('circular');
      expect(result.self).toBe(result); // Should maintain circular reference
    });
  });
});
