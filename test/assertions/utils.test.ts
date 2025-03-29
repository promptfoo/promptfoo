import * as fs from 'fs';
import * as path from 'path';
import {
  processFileReference,
  getFinalTest,
  coerceString,
  loadFromJavaScriptFile,
} from '../../src/assertions/utils';
import cliState from '../../src/cliState';
import { importModule } from '../../src/esm';
import { loadFile } from '../../src/util/fileLoader';
import type { TestCase, Assertion, ApiProvider } from '../../src/types';

jest.mock('fs');
jest.mock('path');
jest.mock('../../src/cliState');
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));
jest.mock('../../src/util/fileLoader', () => ({
  loadFile: jest.fn(),
}));

describe('processFileReference', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    cliState.basePath = '/base/path';
  });

  it('should handle undefined basePath', async () => {
    cliState.basePath = undefined;
    (loadFile as jest.Mock).mockResolvedValue({ key: 'value' });
    
    const result = await processFileReference('file://test.json');
    expect(result).toEqual({ key: 'value' });
    expect(loadFile).toHaveBeenCalledWith('test.json', { basePath: '' });
  });

  it('should process JSON files correctly', async () => {
    (loadFile as jest.Mock).mockResolvedValue({ key: 'value' });
    
    const result = await processFileReference('file://test.json');
    expect(result).toEqual({ key: 'value' });
    expect(loadFile).toHaveBeenCalledWith('test.json', { basePath: '/base/path' });
  });

  it('should process YAML files correctly', async () => {
    (loadFile as jest.Mock).mockResolvedValue({ key: 'value' });
    jest.mocked(path.extname).mockReturnValue('.yaml');
    
    const result = await processFileReference('file://test.yaml');
    expect(result).toEqual({ key: 'value' });
    expect(loadFile).toHaveBeenCalledWith('test.yaml', { basePath: '/base/path' });
  });

  it('should process YML files correctly', async () => {
    (loadFile as jest.Mock).mockResolvedValue({ key: 'value' });
    jest.mocked(path.extname).mockReturnValue('.yml');
    
    const result = await processFileReference('file://test.yml');
    expect(result).toEqual({ key: 'value' });
    expect(loadFile).toHaveBeenCalledWith('test.yml', { basePath: '/base/path' });
  });

  it('should process TXT files correctly', async () => {
    (loadFile as jest.Mock).mockResolvedValue('plain text content\n');
    jest.mocked(path.extname).mockReturnValue('.txt');
    
    const result = await processFileReference('file://test.txt');
    expect(result).toBe('plain text content');
    expect(loadFile).toHaveBeenCalledWith('test.txt', { basePath: '/base/path' });
  });

  it('should handle objects returned from loadFile', async () => {
    (loadFile as jest.Mock).mockResolvedValue({ nested: { object: true } });
    
    const result = await processFileReference('file://test.json');
    expect(result).toEqual({ nested: { object: true } });
    expect(loadFile).toHaveBeenCalledWith('test.json', { basePath: '/base/path' });
  });

  it('should handle file types by passing them to loadFile', async () => {
    jest.mocked(path.extname).mockReturnValue('.unsupported');
    (loadFile as jest.Mock).mockResolvedValue('content from unsupported file type');
    
    const result = await processFileReference('file://test.unsupported');
    expect(result).toEqual('content from unsupported file type');
    expect(loadFile).toHaveBeenCalledWith('test.unsupported', { basePath: '/base/path' });
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
    jest.clearAllMocks();
  });

  const createMockProvider = (id: string): ApiProvider => ({
    id: () => id,
    callApi: jest.fn(),
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
    jest.resetAllMocks();
  });

  it('should call named function when functionName is provided', async () => {
    const mockFn = jest.fn().mockReturnValue('result');
    jest.mocked(importModule).mockResolvedValue({ testFn: mockFn });

    const result = await loadFromJavaScriptFile('/test.js', 'testFn', ['arg1', 'arg2']);

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should call default function when no functionName provided', async () => {
    const mockFn = jest.fn().mockReturnValue('result');
    jest.mocked(importModule).mockResolvedValue(mockFn);

    const result = await loadFromJavaScriptFile('/test.js', undefined, ['arg1']);

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith('arg1');
  });

  it('should call default export function when available', async () => {
    const mockFn = jest.fn().mockReturnValue('result');
    jest.mocked(importModule).mockResolvedValue({ default: mockFn });

    const result = await loadFromJavaScriptFile('/test.js', undefined, ['arg1']);

    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalledWith('arg1');
  });

  it('should throw error when module does not export a function', async () => {
    jest.mocked(importModule).mockResolvedValue({ notAFunction: 'value' });

    await expect(loadFromJavaScriptFile('/test.js', undefined, [])).rejects.toThrow(
      'Assertion malformed',
    );
  });

  it('should throw error when named function does not exist', async () => {
    jest.mocked(importModule).mockResolvedValue({ otherFn: () => {} });

    await expect(loadFromJavaScriptFile('/test.js', 'nonExistentFn', [])).rejects.toThrow(
      'Assertion malformed',
    );
  });
});
