import fs from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { runAssertion } from '../../src/assertions';
import logger from '../../src/logger';
import { AtomicTestCase, Assertion, ProviderResponse } from '../../src/types';
import { loadFileReference } from '../../src/util/fileReference';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/logger');
jest.mock('../../src/util/fileReference');
jest.mock('../../src/util/templates', () => ({
  getNunjucksEngine: jest.fn().mockReturnValue({
    renderString: jest.fn((str) => str),
  }),
}));

describe('Assertions with file references', () => {
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

    (logger.warn as jest.Mock).mockImplementation(
      () =>
        ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }) as unknown as Logger,
    );

    // Mock path functions
    jest.mocked(path.resolve).mockImplementation((...parts) => parts.join('/'));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  const mockProviderResponse: ProviderResponse = {
    output: 'This is a test response from the provider',
  };

  it('should use loadFileReference for string file references in assertion values', async () => {
    // Arrange
    const fileContent = 'Expected value from file';
    jest.mocked(loadFileReference).mockResolvedValue(fileContent);

    const assertion: Assertion = {
      type: 'contains',
      value: 'file:///path/to/expected.txt',
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: mockProviderResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/expected.txt',
      expect.any(String),
    );
    expect(result).toEqual(
      expect.objectContaining({
        pass: false, // Because our mock response doesn't actually contain the expected text
      }),
    );
  });

  it('should use loadFileReference and execute JavaScript assertion files', async () => {
    // Arrange
    const mockAssertFunction = jest.fn().mockReturnValue({
      pass: true,
      score: 1.0,
      reason: 'Custom assertion passed',
    });

    jest.mocked(loadFileReference).mockResolvedValue(mockAssertFunction);

    const assertion: Assertion = {
      type: 'javascript',
      value: 'file:///path/to/custom-assert.js',
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: mockProviderResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/custom-assert.js',
      expect.any(String),
    );
    expect(mockAssertFunction).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
        score: 1.0,
        reason: 'Custom assertion passed',
      }),
    );
  });

  it('should use loadFileReference and execute Python assertion files', async () => {
    // Arrange
    const mockAssertFunction = jest.fn().mockReturnValue({
      pass: true,
      score: 0.95,
      reason: 'Python assertion passed',
    });

    jest.mocked(loadFileReference).mockResolvedValue(mockAssertFunction);

    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/custom-assert.py',
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: mockProviderResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/custom-assert.py',
      expect.any(String),
    );
    expect(mockAssertFunction).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
        score: 0.95,
        reason: 'Python assertion passed',
      }),
    );
  });

  it('should handle Python files with specific function names', async () => {
    // Arrange
    const mockAssertFunction = jest.fn().mockReturnValue({
      pass: true,
      score: 0.8,
      reason: 'Named function assertion passed',
    });

    jest.mocked(loadFileReference).mockResolvedValue(mockAssertFunction);

    const assertion: Assertion = {
      type: 'python',
      value: 'file:///path/to/custom-assert.py:custom_assert_func',
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: mockProviderResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/custom-assert.py:custom_assert_func',
      expect.any(String),
    );
    expect(mockAssertFunction).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
        score: 0.8,
        reason: 'Named function assertion passed',
      }),
    );
  });

  it('should handle file references in array values', async () => {
    // Arrange
    jest
      .mocked(loadFileReference)
      .mockResolvedValueOnce('Value 1')
      .mockResolvedValueOnce('Value 2');

    const assertion: Assertion = {
      type: 'contains-any',
      value: ['file:///path/to/value1.txt', 'file:///path/to/value2.txt', 'static value'],
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: mockProviderResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalledTimes(2);
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/value1.txt',
      expect.any(String),
    );
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/value2.txt',
      expect.any(String),
    );
  });

  it('should handle errors when loading file references', async () => {
    // Arrange
    const fileError = new Error('Failed to load file');
    jest.mocked(loadFileReference).mockRejectedValue(fileError);

    const assertion: Assertion = {
      type: 'contains',
      value: 'file:///path/to/nonexistent.txt',
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: mockProviderResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        pass: false,
        score: 0,
        reason: 'Failed to load file',
      }),
    );
  });

  it('should handle JSON files for JSON assertions', async () => {
    // Arrange
    // Create a proper JSON schema instead of just an object
    const jsonSchema = {
      type: 'object',
      required: ['key', 'nested'],
      properties: {
        key: { type: 'string' },
        nested: {
          type: 'object',
          required: ['data'],
          properties: {
            data: { type: 'boolean' },
          },
        },
      },
    };
    jest.mocked(loadFileReference).mockResolvedValue(jsonSchema);

    const assertion: Assertion = {
      type: 'contains-json',
      value: 'file:///path/to/expected.json',
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    const jsonResponse: ProviderResponse = {
      output: JSON.stringify({ key: 'value', nested: { data: true }, extra: 'field' }),
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: jsonResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/expected.json',
      expect.any(String),
    );
    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
      }),
    );
  });

  it('should handle YAML files for assertions', async () => {
    // Arrange
    // Create a proper JSON schema instead of just an object
    const yamlSchema = {
      type: 'object',
      required: ['expected'],
      properties: {
        expected: { type: 'string' },
      },
    };
    jest.mocked(loadFileReference).mockResolvedValue(yamlSchema);

    const assertion: Assertion = {
      type: 'contains-json',
      value: 'file:///path/to/expected.yaml',
    };

    const test: AtomicTestCase = {
      vars: {},
    };

    const jsonResponse: ProviderResponse = {
      output: JSON.stringify({ expected: 'YAML content', more: 'stuff' }),
    };

    // Act
    const result = await runAssertion({
      assertion,
      test,
      providerResponse: jsonResponse,
    });

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/expected.yaml',
      expect.any(String),
    );
    expect(result).toEqual(
      expect.objectContaining({
        pass: true,
      }),
    );
  });
});
