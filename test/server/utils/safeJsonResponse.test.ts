import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TOO_LARGE_MESSAGE,
  isJsonSerializationLimitError,
  sendJsonResponse,
} from '../../../src/server/utils/safeJsonResponse';
import type { Response } from 'express';

function createMockResponse() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    contentType: undefined as string | undefined,
    status: vi.fn(function status(this: typeof res, code: number) {
      this.statusCode = code;
      return this;
    }),
    type: vi.fn(function type(this: typeof res, value: string) {
      this.contentType = value;
      return this;
    }),
    send: vi.fn(function send(this: typeof res, value: unknown) {
      this.body = value;
      return this;
    }),
  };
  return res;
}

/**
 * A payload whose `toJSON` throws the exact V8 RangeError we care about, so that
 * `JSON.stringify(payload)` reproduces the issue #7649 failure deterministically
 * without allocating a ~512MB string.
 */
function oversizedPayload(message = 'Invalid string length') {
  return {
    toJSON() {
      throw new RangeError(message);
    },
  };
}

describe('isJsonSerializationLimitError', () => {
  it('matches the oversized-string RangeError variants', () => {
    expect(isJsonSerializationLimitError(new RangeError('Invalid string length'))).toBe(true);
    expect(
      isJsonSerializationLimitError(
        new RangeError('Cannot create a string longer than 0x1fffffe8 characters'),
      ),
    ).toBe(true);
    expect(isJsonSerializationLimitError(new RangeError('ERR_STRING_TOO_LONG'))).toBe(true);
  });

  it('matches the max call-stack RangeError', () => {
    expect(isJsonSerializationLimitError(new RangeError('Maximum call stack size exceeded'))).toBe(
      true,
    );
  });

  it('does not match unrelated errors', () => {
    // Circular-reference serialization failures are TypeErrors, not RangeErrors.
    expect(
      isJsonSerializationLimitError(new TypeError('Converting circular structure to JSON')),
    ).toBe(false);
    expect(isJsonSerializationLimitError(new RangeError('some other range error'))).toBe(false);
    // A non-RangeError with a matching message must not match.
    expect(isJsonSerializationLimitError(new Error('Invalid string length'))).toBe(false);
    expect(isJsonSerializationLimitError('Invalid string length')).toBe(false);
    expect(isJsonSerializationLimitError(undefined)).toBe(false);
  });
});

describe('sendJsonResponse', () => {
  it('sends the full payload byte-for-byte identical to res.json for normal payloads', () => {
    const res = createMockResponse();
    const payload = {
      table: { head: { prompts: ['p'], vars: ['v'] }, body: [{ outputs: [{ prompt: 'hi' }] }] },
      config: { description: 'my eval', tests: [{ vars: { a: 1 } }] },
      totalCount: 1,
    };

    sendJsonResponse(res as unknown as Response, payload);

    // Contract preservation: identical serialization to `res.json(payload)`,
    // which uses `JSON.stringify(payload)` with Express's default settings.
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.body).toBe(JSON.stringify(payload));
    expect(res.contentType).toBe('application/json');
    expect(res.statusCode).toBe(200);
  });

  it('invokes beforeSend before sending a successful body', () => {
    const res = createMockResponse();
    const calls: string[] = [];
    const beforeSend = vi.fn(() => calls.push('beforeSend'));
    (res.send as unknown as { mockImplementation: (fn: () => void) => void }).mockImplementation(
      () => {
        calls.push('send');
        return res;
      },
    );

    sendJsonResponse(res as unknown as Response, { ok: true }, { beforeSend });

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['beforeSend', 'send']);
  });

  it('returns HTTP 413 with a clear error instead of throwing for oversized payloads (#7649)', () => {
    const res = createMockResponse();
    const beforeSend = vi.fn();

    expect(() =>
      sendJsonResponse(res as unknown as Response, oversizedPayload(), {
        beforeSend,
        evalId: 'abc123',
        tooLargeMessage: 'Eval too large to display. Try reducing the page size.',
      }),
    ).not.toThrow();

    expect(res.statusCode).toBe(413);
    expect(res.contentType).toBe('application/json');
    // The body is exactly the error contract — no stripped/partial payload leaks.
    expect(res.body).toBe(
      JSON.stringify({ error: 'Eval too large to display. Try reducing the page size.' }),
    );
    // Success-only side effects (e.g. download headers) must not run on the 413 path.
    expect(beforeSend).not.toHaveBeenCalled();
  });

  it('degrades a max call-stack RangeError to 413 as well', () => {
    const res = createMockResponse();

    expect(() =>
      sendJsonResponse(
        res as unknown as Response,
        oversizedPayload('Maximum call stack size exceeded'),
      ),
    ).not.toThrow();

    expect(res.statusCode).toBe(413);
    expect(res.body).toBe(JSON.stringify({ error: DEFAULT_TOO_LARGE_MESSAGE }));
  });

  it('logs a warning with the eval id when the guard fires', () => {
    const res = createMockResponse();
    const logger = { warn: vi.fn() };

    sendJsonResponse(res as unknown as Response, oversizedPayload(), { evalId: 'eval-1', logger });

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][1]).toMatchObject({ evalId: 'eval-1' });
  });

  it('rethrows errors that are not serialization-limit RangeErrors', () => {
    const res = createMockResponse();
    const payload = {
      toJSON() {
        throw new Error('boom');
      },
    };

    expect(() => sendJsonResponse(res as unknown as Response, payload)).toThrow('boom');
    expect(res.send).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });
});
