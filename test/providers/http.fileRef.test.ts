import fs from 'fs';
import path from 'path';
import { Logger } from 'winston';
import { fetchWithCache } from '../../src/cache';
import logger from '../../src/logger';
import { HttpProvider } from '../../src/providers/http';
import { loadFileReference } from '../../src/util/fileReference';

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('../../src/logger');
jest.mock('../../src/cache');
jest.mock('../../src/util/fileReference');

describe('HttpProvider with file references', () => {
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

    // Mock fetchWithCache to return a successful response
    jest.mocked(fetchWithCache).mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: '{"message": "Success"}',
      headers: { 'content-type': 'application/json' },
      cached: false,
    });

    // Mock path functions
    jest.mocked(path.resolve).mockImplementation((...parts) => parts.join('/'));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should use loadFileReference for sessionParser when file:// reference is provided', async () => {
    // Arrange
    const mockParserFunction = jest.fn().mockReturnValue('session-123');
    jest.mocked(loadFileReference).mockResolvedValue(mockParserFunction);

    // Create provider with file reference in sessionParser
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        sessionParser: 'file:///path/to/parser.js',
        method: 'GET',
      },
    });

    // Act
    const result = await provider.callApi('Test prompt');

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith('file:///path/to/parser.js', expect.any(String));
    expect(mockParserFunction).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.any(Object),
        body: expect.any(Object),
      }),
    );
    expect(result).toMatchObject({
      output: expect.any(Object),
      sessionId: 'session-123',
    });
  });

  it('should use loadFileReference for transformResponse when file:// reference is provided', async () => {
    // Arrange
    const mockTransformFunction = jest.fn().mockReturnValue({
      output: 'Transformed response',
    });
    jest.mocked(loadFileReference).mockResolvedValue(mockTransformFunction);

    // Create provider with file reference in transformResponse
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        transformResponse: 'file:///path/to/transform.js',
        method: 'GET',
      },
    });

    // Act
    const result = await provider.callApi('Test prompt');

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/transform.js',
      expect.any(String),
    );
    expect(mockTransformFunction).toHaveBeenCalled();
    expect(result).toMatchObject({
      output: 'Transformed response',
    });
  });

  it('should use loadFileReference for transformRequest when file:// reference is provided', async () => {
    // Arrange
    const mockRequestFunction = jest.fn().mockReturnValue('Transformed prompt');
    jest.mocked(loadFileReference).mockResolvedValue(mockRequestFunction);

    // Create provider with file reference in transformRequest and valid body
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        transformRequest: 'file:///path/to/transform.js',
        method: 'POST',
        body: { key: 'value' },
      },
    });

    // Act
    await provider.callApi('Original prompt');

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/transform.js',
      expect.any(String),
    );
    expect(mockRequestFunction).toHaveBeenCalledWith('Original prompt');
    expect(fetchWithCache).toHaveBeenCalled();
  });

  it('should use loadFileReference for validateStatus when file:// reference is provided', async () => {
    // Arrange
    const mockStatusValidator = jest.fn().mockReturnValue(true);
    jest.mocked(loadFileReference).mockResolvedValue(mockStatusValidator);

    // Create provider with file reference in validateStatus
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        validateStatus: 'file:///path/to/validator.js',
        method: 'GET',
      },
    });

    // Act
    await provider.callApi('Test prompt');

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/validator.js',
      expect.any(String),
    );
    expect(mockStatusValidator).toHaveBeenCalledWith(200);
  });

  it('should handle errors when loading file references', async () => {
    // Arrange
    const fileError = new Error('Failed to load file');
    jest.mocked(loadFileReference).mockRejectedValue(fileError);

    // Create provider with file reference in transformResponse
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        transformResponse: 'file:///path/to/nonexistent.js',
        method: 'GET',
      },
    });

    // Act & Assert
    await expect(provider.callApi('Test prompt')).rejects.toThrow();
    expect(loadFileReference).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('should handle function references with specific named exports', async () => {
    // Arrange
    const mockTransformFunction = jest.fn().mockReturnValue({
      output: 'Transformed by named export',
    });
    jest.mocked(loadFileReference).mockResolvedValue(mockTransformFunction);

    // Create provider with file reference with function name
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        transformResponse: 'file:///path/to/transform.js:processResponse',
        method: 'GET',
      },
    });

    // Act
    const result = await provider.callApi('Test prompt');

    // Assert
    expect(loadFileReference).toHaveBeenCalledWith(
      'file:///path/to/transform.js:processResponse',
      expect.any(String),
    );
    expect(mockTransformFunction).toHaveBeenCalled();
    expect(result).toMatchObject({
      output: 'Transformed by named export',
    });
  });

  it("should throw appropriate error if file reference doesn't return a function", async () => {
    // Arrange
    jest.mocked(loadFileReference).mockResolvedValue({ notAFunction: true });

    // Create provider with invalid file reference
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        transformResponse: 'file:///path/to/invalid.js',
        method: 'GET',
      },
    });

    // Act & Assert
    await expect(provider.callApi('Test prompt')).rejects.toThrow(/must export a function/);
  });

  it('should integrate different file references correctly', async () => {
    // Arrange
    const mockRequestTransform = jest.fn().mockReturnValue('Transformed request');
    const mockResponseTransform = jest.fn().mockReturnValue({
      output: 'Final result',
      tokenUsage: { total: 10 },
    });
    const mockSessionParser = jest.fn().mockReturnValue('session-456');
    const mockStatusValidator = jest.fn().mockReturnValue(true);

    // Set up loadFileReference to return different functions based on the path
    jest.mocked(loadFileReference).mockImplementation((fileRef) => {
      if (fileRef.includes('request')) return Promise.resolve(mockRequestTransform);
      if (fileRef.includes('response')) return Promise.resolve(mockResponseTransform);
      if (fileRef.includes('session')) return Promise.resolve(mockSessionParser);
      if (fileRef.includes('validator')) return Promise.resolve(mockStatusValidator);
      return Promise.reject(new Error('Unknown file reference'));
    });

    // Create provider with multiple file references and valid body
    const provider = new HttpProvider('https://api.example.com', {
      config: {
        transformRequest: 'file:///path/to/request.js',
        transformResponse: 'file:///path/to/response.js',
        sessionParser: 'file:///path/to/session.js',
        validateStatus: 'file:///path/to/validator.js',
        method: 'POST',
        body: { key: 'value' },
      },
    });

    // Act
    const result = await provider.callApi('Original prompt');

    // Assert
    expect(loadFileReference).toHaveBeenCalledTimes(4);
    expect(mockRequestTransform).toHaveBeenCalled();
    expect(mockResponseTransform).toHaveBeenCalled();
    expect(mockSessionParser).toHaveBeenCalled();
    expect(mockStatusValidator).toHaveBeenCalled();

    expect(result).toMatchObject({
      output: 'Final result',
      tokenUsage: { total: 10 },
      sessionId: 'session-456',
    });
  });
});
