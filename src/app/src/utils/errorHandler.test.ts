import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createErrorData,
  ensureError,
  getErrorMessage,
  handleError,
  isError,
  tryCatch,
  tryCatchSync,
} from './errorHandler';

describe('errorHandler', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error object', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should return string errors as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should extract message from object with message property', () => {
      const error = { message: 'Object error message' };
      expect(getErrorMessage(error)).toBe('Object error message');
    });

    it('should return default message for unknown types', () => {
      expect(getErrorMessage(null)).toBe('An unexpected error occurred');
      expect(getErrorMessage(undefined)).toBe('An unexpected error occurred');
      expect(getErrorMessage(42)).toBe('An unexpected error occurred');
    });
  });

  describe('createErrorData', () => {
    it('should create error data from Error object', () => {
      const error = new Error('Test error');
      error.name = 'TestError';

      const errorData = createErrorData(error, 'TestContext');

      expect(errorData.message).toBe('Test error');
      expect(errorData.name).toBe('TestError');
      expect(errorData.context).toBe('TestContext');
      expect(errorData.stack).toBeDefined();
      expect(errorData.timestamp).toBeGreaterThan(0);
    });

    it('should handle non-Error objects', () => {
      const errorData = createErrorData('string error');

      expect(errorData.message).toBe('string error');
      expect(errorData.name).toBe('UnknownError');
      expect(errorData.stack).toBeUndefined();
    });

    it('should include URL and userAgent in browser environment', () => {
      const errorData = createErrorData(new Error('test'));

      expect(errorData.url).toBeDefined();
      expect(errorData.userAgent).toBeDefined();
    });
  });

  describe('handleError', () => {
    it('should log error to console', () => {
      const error = new Error('Test error');

      handleError(error, { context: 'TestContext' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[TestContext] Error:',
        expect.objectContaining({
          message: 'Test error',
        }),
      );
    });

    it('should call showToast when provided', () => {
      const showToast = vi.fn();
      const error = new Error('Test error');

      handleError(error, { showToast, context: 'TestContext' });

      expect(showToast).toHaveBeenCalledWith('Test error', 'error', undefined);
    });

    it('should not call showToast when silent is true', () => {
      const showToast = vi.fn();
      const error = new Error('Test error');

      handleError(error, { showToast, silent: true });

      expect(showToast).not.toHaveBeenCalled();
    });

    it('should pass custom toast duration', () => {
      const showToast = vi.fn();
      const error = new Error('Test error');

      handleError(error, { showToast, toastDuration: 5000 });

      expect(showToast).toHaveBeenCalledWith('Test error', 'error', 5000);
    });
  });

  describe('tryCatch', () => {
    it('should return result on success', async () => {
      const result = await tryCatch(() => Promise.resolve('success'));

      expect(result).toBe('success');
    });

    it('should return null on error', async () => {
      const result = await tryCatch(() => Promise.reject(new Error('fail')));

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return fallback value on error', async () => {
      const result = await tryCatch(() => Promise.reject(new Error('fail')), {
        fallback: 'fallback-value',
      });

      expect(result).toBe('fallback-value');
    });

    it('should call showToast on error', async () => {
      const showToast = vi.fn();

      await tryCatch(() => Promise.reject(new Error('fail')), { showToast });

      expect(showToast).toHaveBeenCalledWith('fail', 'error', undefined);
    });
  });

  describe('tryCatchSync', () => {
    it('should return result on success', () => {
      const result = tryCatchSync(() => 'success');

      expect(result).toBe('success');
    });

    it('should return null on error', () => {
      const result = tryCatchSync(() => {
        throw new Error('fail');
      });

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return fallback value on error', () => {
      const result = tryCatchSync(
        () => {
          throw new Error('fail');
        },
        { fallback: 'fallback-value' },
      );

      expect(result).toBe('fallback-value');
    });
  });

  describe('isError', () => {
    it('should return true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true);
      expect(isError(new TypeError('test'))).toBe(true);
    });

    it('should return false for non-Error values', () => {
      expect(isError('string')).toBe(false);
      expect(isError({ message: 'not an error' })).toBe(false);
      expect(isError(null)).toBe(false);
      expect(isError(undefined)).toBe(false);
    });
  });

  describe('ensureError', () => {
    it('should return Error instances as-is', () => {
      const error = new Error('test');
      expect(ensureError(error)).toBe(error);
    });

    it('should wrap strings in Error', () => {
      const result = ensureError('string error');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('string error');
    });

    it('should wrap unknown values in Error with default message', () => {
      const result = ensureError(null);
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('An unexpected error occurred');
    });
  });
});
