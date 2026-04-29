import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { z } from 'zod';
import logger from '../../../src/logger';
import { replyValidationError, sendError } from '../../../src/server/utils/errors';
import type { Response } from 'express';

vi.mock('../../../src/logger', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

function createResponseMock(): {
  res: Response;
  status: Mock;
  json: Mock;
} {
  const json = vi.fn().mockReturnThis();
  const status = vi.fn(() => ({ json }));
  return {
    res: { status, json } as unknown as Response,
    status: status as unknown as Mock,
    json,
  };
}

describe('server/utils/errors', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sendError', () => {
    it('returns the public message and never leaks the internal error', () => {
      const { res, status, json } = createResponseMock();

      sendError(res, 500, 'Failed to do thing', new Error('secret db password leaked'));

      expect(status).toHaveBeenCalledWith(500);
      const body = json.mock.calls[0]?.[0];
      expect(body).toEqual({ error: 'Failed to do thing' });
      expect(JSON.stringify(body)).not.toContain('secret db password');
    });

    it('skips logging when no internal error is provided', () => {
      const { res } = createResponseMock();

      sendError(res, 404, 'Not found');

      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs Error name, message, and stack as a structured object', () => {
      const { res } = createResponseMock();
      const err = new Error('boom');
      err.stack = 'Error: boom\n    at someFn';

      sendError(res, 500, 'Failed', err);

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [message, context] = (logger.error as unknown as Mock).mock.calls[0];
      expect(message).toBe('Failed');
      expect(context).toEqual({
        error: {
          name: 'Error',
          message: 'boom',
          stack: 'Error: boom\n    at someFn',
        },
      });
    });

    it('preserves Error.cause when present', () => {
      const { res } = createResponseMock();
      const cause = new Error('underlying');
      const err = new Error('wrapper', { cause });

      sendError(res, 500, 'Failed', err);

      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      expect((context as { error: { cause: unknown } }).error.cause).toBe(cause);
    });

    it('passes non-Error values through verbatim', () => {
      const { res } = createResponseMock();

      sendError(res, 500, 'Failed', 'plain string error');

      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      expect(context).toEqual({ error: 'plain string error' });
    });
  });

  describe('replyValidationError', () => {
    let zodError: z.ZodError;

    beforeEach(() => {
      const schema = z.object({
        name: z.string(),
        age: z.number().int().nonnegative(),
      });
      const result = schema.safeParse({ name: 42, age: -1 });
      if (result.success) {
        throw new Error('expected parse to fail');
      }
      zodError = result.error;
    });

    it('returns a 400 with prettified message in `error`', () => {
      const { res, status, json } = createResponseMock();

      replyValidationError(res, zodError);

      expect(status).toHaveBeenCalledWith(400);
      const body = json.mock.calls[0]?.[0] as { error: string };
      expect(typeof body.error).toBe('string');
      expect(body.error.length).toBeGreaterThan(0);
    });

    it('exposes structured Zod issues in `details` for programmatic clients', () => {
      const { res, json } = createResponseMock();

      replyValidationError(res, zodError);

      const body = json.mock.calls[0]?.[0] as {
        details: { issues: z.core.$ZodIssue[] };
      };
      expect(Array.isArray(body.details.issues)).toBe(true);
      expect(body.details.issues.length).toBe(zodError.issues.length);
      const paths = body.details.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('name');
      expect(paths).toContain('age');
    });
  });
});
