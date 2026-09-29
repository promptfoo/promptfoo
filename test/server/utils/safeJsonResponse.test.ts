import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendJsonResponse } from '../../../src/server/utils/safeJsonResponse';
import type { Response } from 'express';

function createMockResponse() {
  const res = {
    app: express(),
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
    json: vi.fn(function json(this: typeof res, value: unknown) {
      this.contentType = 'application/json';
      this.body = JSON.stringify(value);
      return this;
    }),
  };
  return res;
}

// Exercise the engine-limit path without allocating a large string.
function oversizedPayload(message = 'Invalid string length') {
  return {
    toJSON() {
      throw new RangeError(message);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('sendJsonResponse', () => {
  it('serializes normal payloads without modification', () => {
    const res = createMockResponse();
    const payload = {
      table: { head: { prompts: ['p'], vars: ['v'] }, body: [{ outputs: [{ prompt: 'hi' }] }] },
      config: { description: 'my eval', tests: [{ vars: { a: 1 } }] },
      totalCount: 1,
    };

    sendJsonResponse(res as unknown as Response, payload);

    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.body).toBe(JSON.stringify(payload));
    expect(res.contentType).toBe('application/json');
    expect(res.statusCode).toBe(200);
  });

  it('invokes beforeSend before sending a successful body', () => {
    const res = createMockResponse();
    const calls: string[] = [];
    const beforeSend = vi.fn(() => calls.push('beforeSend'));
    res.send.mockImplementation(() => {
      calls.push('send');
      return res;
    });

    sendJsonResponse(res as unknown as Response, { ok: true }, { beforeSend });

    expect(beforeSend).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['beforeSend', 'send']);
  });

  it('preserves JSON.stringify semantics for an undefined payload', () => {
    const res = createMockResponse();

    sendJsonResponse(res as unknown as Response, undefined);

    expect(res.send).toHaveBeenCalledWith(undefined);
    expect(res.contentType).toBe('application/json');
    expect(res.statusCode).toBe(200);
  });

  it.each([
    (_key: string, value: unknown) => (value === 'omit this field' ? undefined : value),
    ['visible', 'nested'],
  ])('matches Express JSON settings on the wire for replacer %s', async (replacer) => {
    const app = express();
    const payload = {
      visible: '<&>',
      hidden: 'omit this field',
      nested: { visible: 'kept', hidden: 'omit this field' },
    };
    app.set('json replacer', replacer);
    app.set('json spaces', 2);
    app.set('json escape', true);
    app.get('/native', (_req, res) => res.json(payload));
    app.get('/guarded', (_req, res) => sendJsonResponse(res, payload));

    const native = await request(app).get('/native');
    const guarded = await request(app).get('/guarded');

    expect(guarded.status).toBe(200);
    expect(guarded.text).toBe(native.text);
    expect(guarded.text).not.toContain('omit this field');
    expect(guarded.text).toContain('\\u003c\\u0026\\u003e');
    expect(guarded.text).toContain('\n  "visible"');
    expect(guarded.headers['content-type']).toBe(native.headers['content-type']);
    expect(guarded.headers['content-length']).toBe(native.headers['content-length']);
  });

  it('matches the native empty response for an undefined payload', async () => {
    const app = express();
    app.get('/native', (_req, res) => res.json(undefined));
    app.get('/guarded', (_req, res) => sendJsonResponse(res, undefined));

    const native = await request(app).get('/native');
    const guarded = await request(app).get('/guarded');

    expect(guarded.status).toBe(native.status);
    expect(guarded.text).toBe(native.text);
    expect(guarded.headers['content-type']).toBe(native.headers['content-type']);
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

  it.each([
    'Cannot create a string longer than 0x1fffffe8 characters',
    'ERR_STRING_TOO_LONG',
    'Maximum call stack size exceeded',
  ])('returns 413 for the V8 serialization-limit message %s', (message) => {
    const res = createMockResponse();

    expect(() =>
      sendJsonResponse(res as unknown as Response, oversizedPayload(message)),
    ).not.toThrow();

    expect(res.statusCode).toBe(413);
    expect(res.body).toBe(JSON.stringify({ error: 'Response payload is too large to serialize' }));
  });

  it('logs a warning with the eval id when the guard fires', () => {
    const res = createMockResponse();
    const logger = { warn: vi.fn() };

    sendJsonResponse(res as unknown as Response, oversizedPayload(), { evalId: 'eval-1', logger });

    expect(logger.warn).toHaveBeenCalledWith(
      '[sendJsonResponse] JSON serialization hit an engine limit; returning 413',
      expect.objectContaining({ evalId: 'eval-1' }),
    );
  });

  it.each([
    new Error('Invalid string length'),
    new RangeError('some other range error'),
    new TypeError('Converting circular structure to JSON'),
  ])('rethrows non-limit serialization errors', (error) => {
    const res = createMockResponse();
    const payload = {
      toJSON() {
        throw error;
      },
    };

    expect(() => sendJsonResponse(res as unknown as Response, payload)).toThrow(error);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('rethrows native BigInt and circular-reference serialization errors', () => {
    const bigintResponse = createMockResponse();
    expect(() => sendJsonResponse(bigintResponse as unknown as Response, 1n)).toThrow(TypeError);

    const circularResponse = createMockResponse();
    const circularPayload: { self?: unknown } = {};
    circularPayload.self = circularPayload;
    expect(() =>
      sendJsonResponse(circularResponse as unknown as Response, circularPayload),
    ).toThrow(TypeError);
  });
});
