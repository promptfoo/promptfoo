import * as fs from 'fs';
import * as path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  coerceString,
  getFinalTest,
  loadFromJavaScriptFile,
  processFileReference,
} from '../../src/assertions/utils';
import cliState from '../../src/cliState';
import { importModule } from '../../src/esm';

import type { ApiProvider, Assertion, ProviderResponse, TestCase } from '../../src/types/index';

vi.mock('fs');
vi.mock('path');
vi.mock('../../src/cliState');
vi.mock('../../src/esm', () => ({
  importModule: vi.fn(),
}));

describe('processFileReference', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    cliState.basePath = '/base/path';
  });

  it('should handle undefined basePath', () => {
    cliState.basePath = undefined;
    const jsonContent = JSON.stringify({ key: 'value' });
    vi.mocked(fs.readFileSync).mockReturnValue(jsonContent);
    vi.mocked(path.resolve).mockReturnValue('/test.json');
    vi.mocked(path.extname).mockReturnValue('.json');

    const result = processFileReference('file://test.json');
    expect(result).toEqual({ key: 'value' });
    expect(fs.readFileSync).toHaveBeenCalledWith('/test.json', 'utf8');
  });

  it('should process JSON files correctly', () => {
    const jsonContent = JSON.stringify({ key: 'value' });
    vi.mocked(fs.readFileSync).mockReturnValue(jsonContent);
    vi.mocked(path.resolve).mockReturnValue('/base/path/test.json');
    vi.mocked(path.extname).mockReturnValue('.json');

    const result = processFileReference('file://test.json');
    expect(result).toEqual({ key: 'value' });
    expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/test.json', 'utf8');
  });

  it('should process YAML files correctly', () => {
    const yamlContent = 'key: value';
    vi.mocked(fs.readFileSync).mockReturnValue(yamlContent);
    vi.mocked(path.resolve).mockReturnValue('/base/path/test.yaml');
    vi.mocked(path.extname).mockReturnValue('.yaml');

    const result = processFileReference('file://test.yaml');
    expect(result).toEqual({ key: 'value' });
    expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/test.yaml', 'utf8');
  });

  it('should process YML files correctly', () => {
    const yamlContent = 'key: value';
    vi.mocked(fs.readFileSync).mockReturnValue(yamlContent);
    vi.mocked(path.resolve).mockReturnValue('/base/path/test.yml');
    vi.mocked(path.extname).mockReturnValue('.yml');

    const result = processFileReference('file://test.yml');
    expect(result).toEqual({ key: 'value' });
    expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/test.yml', 'utf8');
  });

  it('should process TXT files correctly', () => {
    const txtContent = 'plain text content\n';
    vi.mocked(fs.readFileSync).mockReturnValue(txtContent);
    vi.mocked(path.resolve).mockReturnValue('/base/path/test.txt');
    vi.mocked(path.extname).mockReturnValue('.txt');

    const result = processFileReference('file://test.txt');
    expect(result).toBe('plain text content');
    expect(fs.readFileSync).toHaveBeenCalledWith('/base/path/test.txt', 'utf8');
  });

  it('should throw an error for unsupported file types', () => {
    vi.mocked(path.resolve).mockReturnValue('/base/path/test.unsupported');
    vi.mocked(path.extname).mockReturnValue('.unsupported');

    expect(() => processFileReference('file://test.unsupported')).toThrow('Unsupported file type');
  });
});

describe('coerceString', () => {
  it('should return string as is when input is a string', () => {
    const input = 'hello world';
    expect(coerceString(input)).toBe(input);
  });

  it('should convert object to JSON string', () => {
    const input = { key: 'value', nested: { foo: 'bar' } };
    expect(coerceString(input)).toBe(JSON.stringify(input));
  });

  it('should convert array to JSON string', () => {
    const input = [1, 2, { key: 'value' }];
    expect(coerceString(input)).toBe(JSON.stringify(input));
  });

  it('should handle empty object', () => {
    const input = {};
    expect(coerceString(input)).toBe('{}');
  });
});

describe('getFinalTest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockProvider = (id: string): ApiProvider => ({
    id: () => id,
    callApi: vi.fn().mockResolvedValue({} as ProviderResponse),
  });

  it('should correctly merge test and assertion data', () => {
    const mockApiProvider = createMockProvider('mockProvider');
    const testCase: TestCase = {
      vars: { var1: 'value1' },
      options: {
        provider: createMockProvider('testProvider'),
      },
    };

    const assertion: Assertion = {
      type: 'equals',
      value: 'expected value',
      provider: mockApiProvider,
      rubricPrompt: 'custom rubric prompt',
    };

    const result = getFinalTest(testCase, assertion);

    expect(Object.isFrozen(result)).toBe(true);
    expect(result.options?.provider).toBe(mockApiProvider);
    expect(result.options?.rubricPrompt).toBe('custom rubric prompt');
    expect(result.vars).toEqual({ var1: 'value1' });
  });

  it('should use test provider when assertion provider is not provided', () => {
    const testProvider = createMockProvider('testProvider');
    const testCase: TestCase = {
      options: {
        provider: testProvider,
      },
    };

    const assertion: Assertion = {
      type: 'equals',
      value: 'expected value',
    };

    const result = getFinalTest(testCase, assertion);
    expect(result.options?.provider).toBe(testProvider);
  });

  it('should handle test with direct provider property', () => {
    const testProvider = createMockProvider('testProvider');
    const assertionProvider = createMockProvider('assertionProvider');

    const testCase: TestCase = {
      provider: testProvider,
    };

    const assertion: Assertion = {
      type: 'equals',
      value: 'expected value',
      provider: assertionProvider,
    };

    const result = getFinalTest(testCase, assertion);
    expect(result.provider).toBe(testProvider);
    expect(result.options?.provider).toBe(assertionProvider);
  });

  it('should handle undefined providers correctly', () => {
    const testCase: TestCase = {
      vars: { test: 'value' },
      options: {},
    };

    const assertion: Assertion = {
      type: 'equals',
      value: 'expected value',
    };

    const result = getFinalTest(testCase, assertion);
    expect(result.options?.provider).toBeUndefined();
    expect(result.provider).toBeUndefined();
  });

  it('should handle both provider in options and direct provider', () => {
    const optionsProvider = createMockProvider('optionsProvider');
    const directProvider = createMockProvider('directProvider');
    const assertionProvider = createMockProvider('assertionProvider');

    const testCase: TestCase = {
      provider: directProvider,
      options: {
        provider: optionsProvider,
      },
    };

    const assertion: Assertion = {
      type: 'equals',
      value: 'expected value',
      provider: assertionProvider,
    };

    const result = getFinalTest(testCase, assertion);
    expect(result.provider).toBe(directProvider);
    expect(result.options?.provider).toBe(assertionProvider);
  });
});

describe('loadFromJavaScriptFile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should call named function when functionName is provided', async () => {
    const mockFn = vi.fn().mockReturnValue('result');
    vi.mocked(importModule).mockResolvedValue({ testFn: mockFn });

    const result = await loadFromJavaScriptFile('/test.js', 'testFn', ['arg1', 'arg2']);

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should call default function when no functionName provided', async () => {
    const mockFn = vi.fn().mockReturnValue('result');
    vi.mocked(importModule).mockResolvedValue(mockFn);

    const result = await loadFromJavaScriptFile('/test.js', undefined, ['arg1']);

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith('arg1');
  });

  it('should call default export function when available', async () => {
    const mockFn = vi.fn().mockReturnValue('result');
    vi.mocked(importModule).mockResolvedValue({ default: mockFn });

    const result = await loadFromJavaScriptFile('/test.js', undefined, ['arg1']);

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith('arg1');
  });

  it('should throw error when module does not export a function', async () => {
    vi.mocked(importModule).mockResolvedValue({ notAFunction: 'value' });

    await expect(loadFromJavaScriptFile('/test.js', undefined, [])).rejects.toThrow(
      'Assertion malformed',
    );
  });

  it('should throw error when named function does not exist', async () => {
    vi.mocked(importModule).mockResolvedValue({ otherFn: () => {} });

    await expect(loadFromJavaScriptFile('/test.js', 'nonExistentFn', [])).rejects.toThrow(
      'Assertion malformed',
    );
  });
});
