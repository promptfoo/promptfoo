import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, callApiTyped } from './apiTypes';
import * as apiModule from './api';

vi.mock('./api', () => ({
  callApi: vi.fn(),
}));

describe('ApiError', () => {
  it('should create error with message', () => {
    const error = new ApiError('Test error');

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('ApiError');
    expect(error.code).toBeUndefined();
    expect(error.statusCode).toBeUndefined();
  });

  it('should create error with code and status', () => {
    const error = new ApiError('Test error', 'NOT_FOUND', 404);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
  });

  it('should maintain proper stack trace', () => {
    const error = new ApiError('Test error');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ApiError');
  });

  it('should be instanceof Error', () => {
    const error = new ApiError('Test error');

    expect(error instanceof Error).toBe(true);
    expect(error instanceof ApiError).toBe(true);
  });
});

describe('callApiTyped', () => {
  const mockCallApi = vi.mocked(apiModule.callApi);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return parsed JSON on successful response', async () => {
    const mockData = { success: true, data: { id: '123', name: 'Test' } };

    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await callApiTyped('/test', { method: 'GET' });

    expect(result).toEqual(mockData);
    expect(mockCallApi).toHaveBeenCalledWith('/test', { method: 'GET' });
  });

  it('should throw ApiError on non-ok response', async () => {
    const mockErrorData = {
      success: false,
      error: 'Not found',
      code: 'NOT_FOUND',
    };

    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify(mockErrorData), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    try {
      await callApiTyped('/test');
      expect.fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (error instanceof ApiError) {
        expect(error.message).toBe('Not found');
        expect(error.code).toBe('NOT_FOUND');
        expect(error.statusCode).toBe(404);
      }
    }
  });

  it('should use generic error message if none provided', async () => {
    const mockErrorData = {
      success: false,
      code: 'INTERNAL_ERROR',
    };

    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify(mockErrorData), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(callApiTyped('/test')).rejects.toThrow('Request failed');

    try {
      await callApiTyped('/test');
    } catch (error) {
      if (error instanceof ApiError) {
        expect(error.message).toBe('Request failed');
        expect(error.code).toBe('INTERNAL_ERROR');
        expect(error.statusCode).toBe(500);
      }
    }
  });

  it('should handle 4xx errors', async () => {
    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Bad request', code: 'INVALID_INPUT' }), {
        status: 400,
      }),
    );

    await expect(callApiTyped('/test')).rejects.toThrow(ApiError);

    try {
      await callApiTyped('/test');
    } catch (error) {
      if (error instanceof ApiError) {
        expect(error.statusCode).toBe(400);
        expect(error.code).toBe('INVALID_INPUT');
      }
    }
  });

  it('should handle 5xx errors', async () => {
    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Server error', code: 'INTERNAL_ERROR' }), {
        status: 503,
      }),
    );

    await expect(callApiTyped('/test')).rejects.toThrow(ApiError);

    try {
      await callApiTyped('/test');
    } catch (error) {
      if (error instanceof ApiError) {
        expect(error.statusCode).toBe(503);
        expect(error.message).toBe('Server error');
      }
    }
  });

  it('should pass through request options', async () => {
    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: 'data' }),
    };

    await callApiTyped('/test', options);

    expect(mockCallApi).toHaveBeenCalledWith('/test', options);
  });

  it('should handle empty response body', async () => {
    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await callApiTyped('/test');

    expect(result).toEqual({});
  });

  it('should work with typed responses', async () => {
    interface TestResponse {
      id: string;
      value: number;
    }

    const mockData = { id: 'test-123', value: 42 };

    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify(mockData), { status: 200 }),
    );

    const result = await callApiTyped<TestResponse>('/test');

    expect(result.id).toBe('test-123');
    expect(result.value).toBe(42);
  });

  it('should handle DELETE requests', async () => {
    const mockDeleteResponse = {
      success: true,
      message: 'Deleted successfully',
    };

    mockCallApi.mockResolvedValue(
      new Response(JSON.stringify(mockDeleteResponse), { status: 200 }),
    );

    const result = await callApiTyped('/eval/123', { method: 'DELETE' });

    expect(result).toEqual(mockDeleteResponse);
  });

  it('should throw ApiError with correct properties on constraint violation', async () => {
    mockCallApi.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Cannot delete: evaluation is referenced by other records.',
          code: 'CONSTRAINT_VIOLATION',
        }),
        { status: 409 },
      ),
    );

    try {
      await callApiTyped('/test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (error instanceof ApiError) {
        expect(error.message).toBe('Cannot delete: evaluation is referenced by other records.');
        expect(error.code).toBe('CONSTRAINT_VIOLATION');
        expect(error.statusCode).toBe(409);
      }
    }
  });

  it('should throw ApiError with correct properties on database busy', async () => {
    mockCallApi.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: false,
          error: 'Database is busy. Please try again in a moment.',
          code: 'DATABASE_BUSY',
        }),
        { status: 503 },
      ),
    );

    try {
      await callApiTyped('/test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      if (error instanceof ApiError) {
        expect(error.message).toBe('Database is busy. Please try again in a moment.');
        expect(error.code).toBe('DATABASE_BUSY');
        expect(error.statusCode).toBe(503);
      }
    }
  });
});
