import { Writable } from 'node:stream';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import winston from 'winston';

describe('structured logging through Winston transports', () => {
  let logging: typeof import('../src/logger');
  let output: string[];

  beforeEach(async () => {
    vi.resetModules();
    logging = await import('../src/logger');
    output = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        output.push(chunk.toString());
        callback();
      },
    });
    logging.winstonLogger.clear().add(
      new winston.transports.Stream({
        stream,
        level: 'debug',
        format: winston.format.json(),
      }),
    );
    logging.setStructuredLogging(true);
  });

  afterEach(() => {
    logging.setStructuredLogging(false);
    logging.winstonLogger.close();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it.each(['debug', 'info', 'warn', 'error'] as const)(
    'preserves sanitized context and caller location in %s transport output',
    (level) => {
      const context = {
        message: 'Context message',
        providerId: 'fixture-provider',
        headers: { Authorization: 'fixture-credential' },
        details: { success: true },
        location: 'context must not override caller location',
      };

      logging.default[level]('Provider result', context);

      expect(output).toHaveLength(1);
      expect(JSON.parse(output[0])).toMatchObject({
        level,
        message: 'Provider result',
        providerId: 'fixture-provider',
        headers: { Authorization: '[REDACTED]' },
        details: { success: true },
        location: expect.stringMatching(/^\[.+:\d+\]$/),
      });
      expect(output[0]).not.toContain('fixture-credential');
      expect(context.message).toBe('Context message');
      expect(context.headers.Authorization).toBe('fixture-credential');
    },
  );

  it.each([
    { structured: false, error: false },
    { structured: false, error: true },
    { structured: true, error: false },
    { structured: true, error: true },
  ])(
    'redacts JSON response fields with structured=$structured and error=$error',
    async ({ structured, error }) => {
      logging.setStructuredLogging(structured);
      const body = {
        success: true,
        access_token: 'fixture-response-access',
        nested: { password: 'fixture-response-password', count: 2 },
        credentials: [{ apiKey: 'fixture-response-key' }],
      };
      const response = new Response(JSON.stringify(body), { status: 200 });

      await logging.logRequestResponse({
        url: 'https://example.test/api',
        requestBody: null,
        requestMethod: 'GET',
        response,
        error,
      });

      expect(output).toHaveLength(1);
      const record = JSON.parse(output[0]);
      expect(record.level).toBe(error ? 'error' : 'debug');
      const context = structured
        ? record
        : JSON.parse(record.message.slice(record.message.indexOf('\n') + 1));
      expect(context.status).toBe(200);
      expect(JSON.parse(context.response)).toEqual({
        success: true,
        access_token: '[REDACTED]',
        nested: { password: '[REDACTED]', count: 2 },
        credentials: '[REDACTED]',
      });
      expect(output[0]).not.toContain('fixture-response-');
      expect(response.bodyUsed).toBe(false);
      expect(await response.json()).toEqual(body);
    },
  );
});
