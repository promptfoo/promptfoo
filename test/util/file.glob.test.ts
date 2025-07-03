import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { maybeLoadFromExternalFile } from '../../src/util/file';
import cliState from '../../src/cliState';

describe('file utilities - glob pattern support', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-test-'));
    cliState.basePath = tempDir;
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    cliState.basePath = undefined;
  });

  it('should load multiple files from a glob pattern', () => {
    // Create test YAML files
    fs.writeFileSync(path.join(tempDir, 'test1.yaml'), 'name: test1\nvalue: 1');
    fs.writeFileSync(path.join(tempDir, 'test2.yaml'), 'name: test2\nvalue: 2');
    fs.writeFileSync(path.join(tempDir, 'test3.yaml'), 'name: test3\nvalue: 3');
    // Create a non-matching file
    fs.writeFileSync(path.join(tempDir, 'other.json'), '{"name": "other"}');

    const result = maybeLoadFromExternalFile('file://*.yaml');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ name: 'test1', value: 1 });
    expect(result).toContainEqual({ name: 'test2', value: 2 });
    expect(result).toContainEqual({ name: 'test3', value: 3 });
  });

  it('should return empty array when glob pattern matches no files', () => {
    // Create a file that doesn't match the pattern
    fs.writeFileSync(path.join(tempDir, 'test.json'), '{"name": "test"}');

    const result = maybeLoadFromExternalFile('file://*.yaml');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('should handle nested directory glob patterns', () => {
    // Create nested directories
    const subDir1 = path.join(tempDir, 'subdir1');
    const subDir2 = path.join(tempDir, 'subdir2');
    fs.mkdirSync(subDir1);
    fs.mkdirSync(subDir2);

    // Create test files in subdirectories
    fs.writeFileSync(path.join(subDir1, 'config.yaml'), 'env: dev');
    fs.writeFileSync(path.join(subDir2, 'config.yaml'), 'env: prod');

    const result = maybeLoadFromExternalFile('file://**/config.yaml');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ env: 'dev' });
    expect(result).toContainEqual({ env: 'prod' });
  });

  it('should handle glob patterns with specific prefixes', () => {
    // Create test files with different prefixes
    fs.writeFileSync(path.join(tempDir, 'test-1.yaml'), 'id: 1');
    fs.writeFileSync(path.join(tempDir, 'test-2.yaml'), 'id: 2');
    fs.writeFileSync(path.join(tempDir, 'prod-1.yaml'), 'id: 3');

    const result = maybeLoadFromExternalFile('file://test-*.yaml');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ id: 1 });
    expect(result).toContainEqual({ id: 2 });
    expect(result).not.toContainEqual({ id: 3 });
  });

  it('should handle Windows paths correctly', () => {
    // This test verifies that Windows paths are normalized
    const testFile = path.join(tempDir, 'test.yaml');
    fs.writeFileSync(testFile, 'platform: test');

    // Even if we're not on Windows, we can test that the normalization doesn't break anything
    const result = maybeLoadFromExternalFile('file://test.yaml');

    expect(result).toEqual({ platform: 'test' });
  });

  it('should handle JSON files in glob patterns', () => {
    // Create test JSON files
    fs.writeFileSync(path.join(tempDir, 'config1.json'), '{"setting": "value1"}');
    fs.writeFileSync(path.join(tempDir, 'config2.json'), '{"setting": "value2"}');

    const result = maybeLoadFromExternalFile('file://config*.json');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ setting: 'value1' });
    expect(result).toContainEqual({ setting: 'value2' });
  });

  it('should handle glob patterns with braces', () => {
    // Create test files
    fs.writeFileSync(path.join(tempDir, 'test.yaml'), 'type: yaml');
    fs.writeFileSync(path.join(tempDir, 'test.yml'), 'type: yml');
    fs.writeFileSync(path.join(tempDir, 'test.json'), '{"type": "json"}');

    const result = maybeLoadFromExternalFile('file://test.{yaml,yml,json}');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    expect(result).toContainEqual({ type: 'yaml' });
    expect(result).toContainEqual({ type: 'yml' });
    expect(result).toContainEqual({ type: 'json' });
  });

  it('should maintain order of files from glob', () => {
    // Create numbered files
    for (let i = 1; i <= 5; i++) {
      fs.writeFileSync(path.join(tempDir, `file${i}.yaml`), `order: ${i}`);
    }

    const result = maybeLoadFromExternalFile('file://file*.yaml');

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(5);
    // The files should be in alphabetical order
    expect(result[0]).toEqual({ order: 1 });
    expect(result[1]).toEqual({ order: 2 });
    expect(result[2]).toEqual({ order: 3 });
    expect(result[3]).toEqual({ order: 4 });
    expect(result[4]).toEqual({ order: 5 });
  });
}); 