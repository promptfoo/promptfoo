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

    it('preserves Error.cause when present, serialized to retain its stack', () => {
      const { res } = createResponseMock();
      const cause = new Error('underlying');
      cause.stack = 'Error: underlying\n    at someInnerFn';
      const err = new Error('wrapper', { cause });

      sendError(res, 500, 'Failed', err);

      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      const ctx = context as { error: { cause: { name: string; message: string; stack: string } } };
      expect(ctx.error.cause.name).toBe('Error');
      expect(ctx.error.cause.message).toBe('underlying');
      // Stack must survive — serializing the raw Error reference would have
      // dropped it via JSON.stringify, which is the regression this helper exists to prevent.
      expect(ctx.error.cause.stack).toContain('someInnerFn');
    });

    it('passes non-Error values through verbatim', () => {
      const { res } = createResponseMock();

      sendError(res, 500, 'Failed', 'plain string error');

      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      expect(context).toEqual({ error: 'plain string error' });
    });

    it('logs `null` as a real (no-detail) failure rather than skipping', () => {
      // Pin current behavior: the guard is `internalError !== undefined`, so
      // `null` reaches the logger. This is intentional — a future refactor to
      // `if (internalError)` would silently swallow falsy-but-real signals
      // (e.g. `0`, `false`, `''`).
      const { res } = createResponseMock();

      sendError(res, 500, 'Failed', null);

      expect(logger.error).toHaveBeenCalledTimes(1);
      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      expect(context).toEqual({ error: null });
    });

    it('preserves enumerable diagnostic fields on Error subclasses', () => {
      // Node SystemError carries `code`/`errno`/`syscall`/`path` as enumerable
      // own props; AWS SDK errors carry `$metadata`/`$fault`; fetch errors
      // carry `code`/`errno`. Logging the explicit four fields without
      // spreading would silently drop these — exactly the production-triage
      // regression flagged by the Codex P2 reviewer on this PR.
      const { res } = createResponseMock();
      const sysErr = Object.assign(new Error('ENOENT: no such file or directory, open ...'), {
        code: 'ENOENT',
        errno: -2,
        syscall: 'open',
        path: '/missing/file',
      });

      sendError(res, 500, 'Failed', sysErr);

      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      const ctx = context as {
        error: {
          name: string;
          message: string;
          stack: string;
          code: string;
          errno: number;
          syscall: string;
          path: string;
        };
      };
      expect(ctx.error.name).toBe('Error');
      expect(ctx.error.code).toBe('ENOENT');
      expect(ctx.error.errno).toBe(-2);
      expect(ctx.error.syscall).toBe('open');
      expect(ctx.error.path).toBe('/missing/file');
      // Standard fields still win even though the subclass also has its own.
      expect(typeof ctx.error.stack).toBe('string');
    });

    it('preserves Error subclass name (TypeError, custom subclasses)', () => {
      const { res } = createResponseMock();
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      sendError(res, 500, 'Failed', new TypeError('not a string'));
      sendError(res, 500, 'Failed', new CustomError('bespoke'));

      const calls = (logger.error as unknown as Mock).mock.calls;
      expect((calls[0][1] as { error: { name: string } }).error.name).toBe('TypeError');
      expect((calls[1][1] as { error: { name: string } }).error.name).toBe('CustomError');
    });

    it('recursively unwraps Error.cause chains so nested stacks survive serialization', () => {
      const { res } = createResponseMock();
      const root = new Error('root cause');
      root.stack = 'Error: root cause\n    at deep';
      const middle = new Error('middle', { cause: root });
      middle.stack = 'Error: middle\n    at middle';
      const top = new Error('top', { cause: middle });
      top.stack = 'Error: top\n    at top';

      sendError(res, 500, 'Failed', top);

      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      const ctx = context as {
        error: {
          stack: string;
          cause: { stack: string; cause: { stack: string } };
        };
      };
      expect(ctx.error.stack).toContain('top');
      expect(ctx.error.cause.stack).toContain('middle');
      expect(ctx.error.cause.cause.stack).toContain('deep');
    });

    it('does not crash on a circular Error.cause', () => {
      const { res, status } = createResponseMock();
      const cyclic = new Error('cyclic') as Error & { cause?: unknown };
      cyclic.cause = cyclic;

      expect(() => sendError(res, 500, 'Failed', cyclic)).not.toThrow();
      // The response must still ship — cycle detection in serializeError is
      // the entire reason this canonical 500 funnel doesn't unhandled-throw.
      expect(status).toHaveBeenCalledWith(500);
    });

    it('caps long Error.cause chains before serializing unbounded logger context', () => {
      const { res } = createResponseMock();
      const chain = Array.from({ length: 6 }, (_, index) => {
        const err = new Error(`level-${index}`) as Error & { cause?: unknown };
        err.stack = `Error: level-${index}\n    at level${index}`;
        return err;
      });
      for (let i = 0; i < chain.length - 1; i++) {
        chain[i].cause = chain[i + 1];
      }

      sendError(res, 500, 'Failed', chain[0]);

      const [, context] = (logger.error as unknown as Mock).mock.calls[0];
      const cappedCause = (
        context as {
          error: { cause: { cause: { cause: { cause: unknown } } } };
        }
      ).error.cause.cause.cause.cause;
      expect(cappedCause).toEqual({ name: 'Error', message: 'level-4' });
      expect(JSON.stringify(context)).not.toContain('level-5');
    });

    it('falls back to a hand-built envelope if ErrorResponseSchema.parse throws', async () => {
      // Force the schema parse to throw, simulating a future tightening that
      // rejects what `sendError` produces. Without the safeRespond fallback,
      // the throw would escape the handler's try/catch and land in Express's
      // default error path (empty 500 with no JSON body).
      const common = await import('../../../src/types/api/common');
      const parseSpy = vi.spyOn(common.ErrorResponseSchema, 'parse').mockImplementationOnce(() => {
        throw new Error('forced schema rejection');
      });

      try {
        const { res, status, json } = createResponseMock();

        expect(() => sendError(res, 500, 'Public message')).not.toThrow();
        expect(status).toHaveBeenCalledWith(500);
        expect(json.mock.calls[0]?.[0]).toEqual({ error: 'Public message' });
        expect(parseSpy).toHaveBeenCalledTimes(1);
      } finally {
        parseSpy.mockRestore();
      }
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
