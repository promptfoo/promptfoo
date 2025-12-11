/**
 * Tests for CellDetailOverlay utility functions.
 */

import { describe, expect, it } from 'vitest';
import {
  categorizeError,
  getErrorCategoryDisplay,
  hasStackTrace,
  splitErrorMessage,
} from '../../../../src/ui/components/table/CellDetailOverlay';

describe('categorizeError', () => {
  describe('assertion errors', () => {
    it('categorizes assertion failures by failureReason', () => {
      // ResultFailureReason.ASSERT = 1
      expect(categorizeError(1, 'Some error')).toBe('assertion');
    });

    it('prioritizes failureReason over message', () => {
      // Even if message contains timeout, assertion takes precedence
      expect(categorizeError(1, 'Request timed out')).toBe('assertion');
    });
  });

  describe('timeout errors', () => {
    it('detects "timeout" in message', () => {
      expect(categorizeError(undefined, 'Request timeout')).toBe('timeout');
    });

    it('detects "timed out" in message', () => {
      expect(categorizeError(2, 'The operation timed out')).toBe('timeout');
    });

    it('detects "ETIMEDOUT" in message', () => {
      expect(categorizeError(2, 'Error: ETIMEDOUT')).toBe('timeout');
    });
  });

  describe('rate limit errors', () => {
    it('detects "rate limit" in message', () => {
      expect(categorizeError(2, 'Rate limit exceeded')).toBe('rate_limit');
    });

    it('detects "429" in message', () => {
      expect(categorizeError(2, 'Error 429: Too many requests')).toBe('rate_limit');
    });

    it('detects "too many requests" in message', () => {
      expect(categorizeError(2, 'Too many requests')).toBe('rate_limit');
    });

    it('detects "quota" in message', () => {
      expect(categorizeError(2, 'Quota exceeded for this model')).toBe('rate_limit');
    });
  });

  describe('network errors', () => {
    it('detects "network" in message', () => {
      expect(categorizeError(2, 'Network error occurred')).toBe('network');
    });

    it('detects "ECONNREFUSED" in message', () => {
      expect(categorizeError(2, 'Error: ECONNREFUSED')).toBe('network');
    });

    it('detects "ENOTFOUND" in message', () => {
      expect(categorizeError(2, 'Error: ENOTFOUND')).toBe('network');
    });

    it('detects "socket" in message', () => {
      expect(categorizeError(2, 'Socket closed unexpectedly')).toBe('network');
    });

    it('detects "connection" in message', () => {
      expect(categorizeError(2, 'Connection refused')).toBe('network');
    });
  });

  describe('API errors', () => {
    it('detects "api" in message', () => {
      expect(categorizeError(2, 'API returned an error')).toBe('api');
    });

    it('detects "401" in message', () => {
      expect(categorizeError(2, 'Error 401: Unauthorized')).toBe('api');
    });

    it('detects "403" in message', () => {
      expect(categorizeError(2, 'Error 403: Forbidden')).toBe('api');
    });

    it('detects "500" in message', () => {
      expect(categorizeError(2, 'Internal Server Error (500)')).toBe('api');
    });

    it('detects "502" in message', () => {
      expect(categorizeError(2, '502 Bad Gateway')).toBe('api');
    });

    it('detects "503" in message', () => {
      expect(categorizeError(2, 'Service Unavailable (503)')).toBe('api');
    });
  });

  describe('unknown errors', () => {
    it('returns unknown for unrecognized errors', () => {
      expect(categorizeError(2, 'Something went wrong')).toBe('unknown');
    });

    it('returns unknown for empty message', () => {
      expect(categorizeError(2, '')).toBe('unknown');
    });

    it('returns unknown for null message', () => {
      expect(categorizeError(2, null)).toBe('unknown');
    });

    it('returns unknown for undefined message', () => {
      expect(categorizeError(2, undefined)).toBe('unknown');
    });
  });

  describe('case insensitivity', () => {
    it('matches regardless of case', () => {
      expect(categorizeError(2, 'TIMEOUT')).toBe('timeout');
      expect(categorizeError(2, 'Rate Limit')).toBe('rate_limit');
      expect(categorizeError(2, 'NETWORK error')).toBe('network');
    });
  });
});

describe('getErrorCategoryDisplay', () => {
  it('returns correct display for API errors', () => {
    const display = getErrorCategoryDisplay('api');
    expect(display.label).toBe('API Error');
    expect(display.color).toBe('red');
  });

  it('returns correct display for assertion errors', () => {
    const display = getErrorCategoryDisplay('assertion');
    expect(display.label).toBe('Assertion Failed');
    expect(display.color).toBe('yellow');
  });

  it('returns correct display for timeout errors', () => {
    const display = getErrorCategoryDisplay('timeout');
    expect(display.label).toBe('Timeout');
    expect(display.color).toBe('magenta');
  });

  it('returns correct display for rate limit errors', () => {
    const display = getErrorCategoryDisplay('rate_limit');
    expect(display.label).toBe('Rate Limited');
    expect(display.color).toBe('yellow');
  });

  it('returns correct display for network errors', () => {
    const display = getErrorCategoryDisplay('network');
    expect(display.label).toBe('Network Error');
    expect(display.color).toBe('red');
  });

  it('returns correct display for unknown errors', () => {
    const display = getErrorCategoryDisplay('unknown');
    expect(display.label).toBe('Error');
    expect(display.color).toBe('red');
  });
});

describe('hasStackTrace', () => {
  it('returns false for null or undefined', () => {
    expect(hasStackTrace(null)).toBe(false);
    expect(hasStackTrace(undefined)).toBe(false);
  });

  it('returns false for simple messages', () => {
    expect(hasStackTrace('Something went wrong')).toBe(false);
  });

  it('detects JavaScript/Node.js stack traces', () => {
    const jsStack = `Error: Something failed
    at Function.run (/path/to/file.js:10:15)
    at processTask (/path/to/task.js:20:25)`;
    expect(hasStackTrace(jsStack)).toBe(true);
  });

  it('detects Java stack traces', () => {
    const javaStack = `Exception in thread "main" java.lang.RuntimeException: Error
\tat com.example.Main.main(Main.java:10)`;
    expect(hasStackTrace(javaStack)).toBe(true);
  });

  it('detects Python tracebacks', () => {
    const pythonStack = `RuntimeError: Something failed
Traceback (most recent call last):
  File "script.py", line 10, in <module>
    main()`;
    expect(hasStackTrace(pythonStack)).toBe(true);
  });

  it('detects Python file references', () => {
    const pythonFile = `Error occurred
File "test.py", line 5, in test
    raise Exception()`;
    expect(hasStackTrace(pythonFile)).toBe(true);
  });
});

describe('splitErrorMessage', () => {
  it('returns empty values for null/undefined', () => {
    expect(splitErrorMessage(null)).toEqual({ mainMessage: '', stackTrace: null });
    expect(splitErrorMessage(undefined)).toEqual({ mainMessage: '', stackTrace: null });
  });

  it('returns original message when no stack trace', () => {
    const message = 'Simple error message';
    expect(splitErrorMessage(message)).toEqual({
      mainMessage: message,
      stackTrace: null,
    });
  });

  it('splits JavaScript stack trace', () => {
    const message = `Error: Something failed
    at Function.run (/path/to/file.js:10:15)
    at processTask (/path/to/task.js:20:25)`;

    const result = splitErrorMessage(message);
    expect(result.mainMessage).toBe('Error: Something failed');
    expect(result.stackTrace).toContain('at Function.run');
  });

  it('splits Python traceback', () => {
    const message = `RuntimeError: Division by zero
Traceback (most recent call last):
  File "script.py", line 10`;

    const result = splitErrorMessage(message);
    expect(result.mainMessage).toBe('RuntimeError: Division by zero');
    expect(result.stackTrace).toContain('Traceback');
  });

  it('preserves multi-line main message before stack', () => {
    const message = `Error: Something failed
Additional context here
    at Function.run (/path/to/file.js:10:15)`;

    const result = splitErrorMessage(message);
    expect(result.mainMessage).toContain('Error: Something failed');
    expect(result.mainMessage).toContain('Additional context here');
    expect(result.stackTrace).toContain('at Function.run');
  });

  it('handles messages with just stack trace', () => {
    const message = `
    at Function.run (/path/to/file.js:10:15)
    at processTask (/path/to/task.js:20:25)`;

    const result = splitErrorMessage(message);
    expect(result.mainMessage).toBe('');
    expect(result.stackTrace).toContain('at Function.run');
  });

  it('handles complex real-world error', () => {
    const message = `Error: Request failed with status code 500
Response body: {"error": "Internal server error"}
    at createError (/node_modules/axios/lib/core/createError.js:16:15)
    at settle (/node_modules/axios/lib/core/settle.js:17:12)`;

    const result = splitErrorMessage(message);
    expect(result.mainMessage).toContain('Request failed with status code 500');
    expect(result.mainMessage).toContain('Response body');
    expect(result.stackTrace).toContain('createError');
  });
});
