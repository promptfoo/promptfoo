import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import {
  sendError,
  sendSuccess,
  HttpStatus,
  ErrorMessages,
  handleRouteError,
  getErrorMessage,
  getQueryString,
  getQueryNumber,
  getQueryBoolean,
  getParam,
} from '../../../src/server/middleware';
import type { ApiErrorResponse, ApiSuccessResponse } from '../../../src/server/middleware/apiResponse';

afterEach(() => {
  vi.resetAllMocks();
});

describe('apiResponse', () => {
  let mockRes: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };
  });

  describe('sendError', () => {
    it('should send error response with correct format', () => {
      sendError(mockRes as unknown as Response, 400, 'Bad request');

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Bad request',
      } satisfies ApiErrorResponse);
    });

    it('should include details when provided', () => {
      sendError(mockRes as unknown as Response, 404, 'Not found', 'The resource was deleted');

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not found',
        details: 'The resource was deleted',
      } satisfies ApiErrorResponse);
    });

    it('should work with HttpStatus constants', () => {
      sendError(mockRes as unknown as Response, HttpStatus.UNAUTHORIZED, 'Auth required');

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Auth required',
      });
    });

    it('should handle server errors', () => {
      sendError(mockRes as unknown as Response, HttpStatus.INTERNAL_SERVER_ERROR, ErrorMessages.INTERNAL_ERROR);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'An unexpected error occurred',
      });
    });

    it('should not include details key when undefined', () => {
      sendError(mockRes as unknown as Response, 400, 'Error');

      const response = mockRes.json.mock.calls[0][0];
      expect(response).not.toHaveProperty('details');
    });
  });

  describe('sendSuccess', () => {
    it('should send success response with data wrapper', () => {
      const data = { items: [1, 2, 3], total: 3 };
      sendSuccess(mockRes as unknown as Response, data);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { items: [1, 2, 3], total: 3 },
      } satisfies ApiSuccessResponse<typeof data>);
    });

    it('should use custom status code when provided', () => {
      sendSuccess(mockRes as unknown as Response, { id: '123' }, 201);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { id: '123' },
      });
    });

    it('should work with HttpStatus constants', () => {
      sendSuccess(mockRes as unknown as Response, { created: true }, HttpStatus.CREATED);

      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    it('should handle null data', () => {
      sendSuccess(mockRes as unknown as Response, null);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: null,
      });
    });

    it('should handle array data', () => {
      sendSuccess(mockRes as unknown as Response, [{ id: 1 }, { id: 2 }]);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: [{ id: 1 }, { id: 2 }],
      });
    });
  });

  describe('HttpStatus', () => {
    it('should have correct success status codes', () => {
      expect(HttpStatus.OK).toBe(200);
      expect(HttpStatus.CREATED).toBe(201);
      expect(HttpStatus.NO_CONTENT).toBe(204);
    });

    it('should have correct client error status codes', () => {
      expect(HttpStatus.BAD_REQUEST).toBe(400);
      expect(HttpStatus.UNAUTHORIZED).toBe(401);
      expect(HttpStatus.FORBIDDEN).toBe(403);
      expect(HttpStatus.NOT_FOUND).toBe(404);
      expect(HttpStatus.CONFLICT).toBe(409);
      expect(HttpStatus.UNPROCESSABLE_ENTITY).toBe(422);
    });

    it('should have correct server error status codes', () => {
      expect(HttpStatus.INTERNAL_SERVER_ERROR).toBe(500);
      expect(HttpStatus.NOT_IMPLEMENTED).toBe(501);
      expect(HttpStatus.SERVICE_UNAVAILABLE).toBe(503);
    });
  });

  describe('ErrorMessages', () => {
    it('should have standard error messages', () => {
      expect(ErrorMessages.NOT_FOUND).toBe('Resource not found');
      expect(ErrorMessages.INVALID_INPUT).toBe('Invalid input');
      expect(ErrorMessages.VALIDATION_FAILED).toBe('Validation failed');
      expect(ErrorMessages.INTERNAL_ERROR).toBe('An unexpected error occurred');
      expect(ErrorMessages.UNAUTHORIZED).toBe('Authentication required');
      expect(ErrorMessages.FORBIDDEN).toBe('Access denied');
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error object', () => {
      expect(getErrorMessage(new Error('Test error'))).toBe('Test error');
    });

    it('should return string errors as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should return "Unknown error" for non-error objects', () => {
      expect(getErrorMessage({ foo: 'bar' })).toBe('Unknown error');
      expect(getErrorMessage(123)).toBe('Unknown error');
      expect(getErrorMessage(null)).toBe('Unknown error');
      expect(getErrorMessage(undefined)).toBe('Unknown error');
    });
  });

  describe('handleRouteError', () => {
    it('should log error and send standardized response', () => {
      const mockLogger = { error: vi.fn() };
      handleRouteError(mockRes as unknown as Response, new Error('Database error'), 'fetching configs', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith('Error fetching configs: Database error');
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed fetching configs',
      });
    });

    it('should use context directly in error message', () => {
      const mockLogger = { error: vi.fn() };
      handleRouteError(mockRes as unknown as Response, new Error('Error'), 'saving config', mockLogger);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed saving config',
      });
    });

    it('should handle string errors', () => {
      const mockLogger = { error: vi.fn() };
      handleRouteError(mockRes as unknown as Response, 'Connection timeout', 'connecting to database', mockLogger);

      expect(mockLogger.error).toHaveBeenCalledWith('Error connecting to database: Connection timeout');
    });
  });

  describe('getQueryString', () => {
    it('should return string query parameter', () => {
      const req = { query: { type: 'config' } };
      expect(getQueryString(req, 'type')).toBe('config');
    });

    it('should return undefined for missing parameter', () => {
      const req = { query: {} };
      expect(getQueryString(req, 'type')).toBeUndefined();
    });

    it('should return undefined for non-string parameter', () => {
      const req = { query: { type: 123 } };
      expect(getQueryString(req, 'type')).toBeUndefined();
    });
  });

  describe('getQueryNumber', () => {
    it('should parse string to number', () => {
      const req = { query: { limit: '10' } };
      expect(getQueryNumber(req, 'limit', 5)).toBe(10);
    });

    it('should return default for missing parameter', () => {
      const req = { query: {} };
      expect(getQueryNumber(req, 'limit', 5)).toBe(5);
    });

    it('should return default for non-numeric string', () => {
      const req = { query: { limit: 'abc' } };
      expect(getQueryNumber(req, 'limit', 5)).toBe(5);
    });

    it('should handle zero correctly', () => {
      const req = { query: { offset: '0' } };
      expect(getQueryNumber(req, 'offset', 10)).toBe(0);
    });

    it('should handle negative numbers', () => {
      const req = { query: { delta: '-5' } };
      expect(getQueryNumber(req, 'delta', 0)).toBe(-5);
    });
  });

  describe('getQueryBoolean', () => {
    it('should parse "true" as true', () => {
      const req = { query: { enabled: 'true' } };
      expect(getQueryBoolean(req, 'enabled')).toBe(true);
    });

    it('should parse "1" as true', () => {
      const req = { query: { enabled: '1' } };
      expect(getQueryBoolean(req, 'enabled')).toBe(true);
    });

    it('should parse "yes" as true', () => {
      const req = { query: { enabled: 'yes' } };
      expect(getQueryBoolean(req, 'enabled')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const req = { query: { enabled: 'TRUE' } };
      expect(getQueryBoolean(req, 'enabled')).toBe(true);
    });

    it('should return false for other values', () => {
      const req = { query: { enabled: 'false' } };
      expect(getQueryBoolean(req, 'enabled')).toBe(false);
    });

    it('should return default for missing parameter', () => {
      const req = { query: {} };
      expect(getQueryBoolean(req, 'enabled', true)).toBe(true);
      expect(getQueryBoolean(req, 'enabled', false)).toBe(false);
    });
  });

  describe('getParam', () => {
    it('should return route parameter', () => {
      const req = { params: { id: '123' } };
      expect(getParam(req, 'id')).toBe('123');
    });

    it('should return empty string for missing parameter', () => {
      const req = { params: {} };
      expect(getParam(req, 'id')).toBe('');
    });
  });
});
