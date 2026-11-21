import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import { gunzipSync } from 'node:zlib';

import compression from 'compression';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMcpErrorHandler } from '../../../src/commands/mcp/defaultErrorHandler';
import logger, { setLogCallback } from '../../../src/logger';
import { defaultErrorHandler } from '../../../src/server/utils/defaultErrorHandler';
import type { ErrorRequestHandler, Express, Response } from 'express';

const require = createRequire(import.meta.url);
const CANARY = 'attached-request-body-canary';
const malformed = `{"payloadNote":"${CANARY}","padding":"${'x'.repeat(512)}","broken":}`;

async function withServer(app: Express, run: (port: number) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Missing HTTP test address');
    }
    await run(address.port);
    await new Promise<void>((resolve) => setImmediate(resolve));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function post(port: number, body: string, pathname = '/', headers: http.OutgoingHttpHeaders = {}) {
  return new Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: string;
    rawBody: Buffer;
  }>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.once('error', reject);
        res.once('end', () => {
          const rawBody = Buffer.concat(chunks);
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            body: rawBody.toString('utf8'),
            rawBody,
          });
        });
      },
    );
    req.setTimeout(2000, () => req.destroy(new Error('HTTP test request timed out')));
    req.once('error', reject);
    req.end(body);
  });
}

afterEach(() => {
  setLogCallback(null);
  vi.restoreAllMocks();
});

describe.each([
  { name: 'view server', handler: defaultErrorHandler },
  {
    name: 'MCP',
    handler: createMcpErrorHandler((message, diagnostic) =>
      logger.error(message, { error: diagnostic }),
    ),
  },
])('$name default error handler', ({ handler }) => {
  it.each(['production', 'development', 'test'])(
    'returns public JSON and logs only legacy text in %s',
    async (environment) => {
      const messages: string[] = [];
      setLogCallback((message) => messages.push(message));
      const app = express();
      app.set('env', environment);
      app.use(express.json());
      app.post('/', (req, res) => res.json({ value: req.body.value }));
      app.post('/failure', () => {
        const error = Object.assign(new Error('legacy diagnostic'), {
          body: CANARY,
          config: { context: CANARY },
          cause: new Error(CANARY),
          status: 429,
          statusCode: 401,
          headers: {
            'Retry-After': '3',
            'WWW-Authenticate': 'Bearer',
            'Set-Cookie': ['a=1', 'b=2'],
          },
        });
        error.stack = 'Error: legacy diagnostic';
        throw error;
      });
      app.use(handler);

      await withServer(app, async (port) => {
        expect(JSON.parse((await post(port, '{"value":"ok"}')).body)).toEqual({ value: 'ok' });
        const invalid = await post(port, malformed);
        expect(invalid.status).toBe(400);
        expect(invalid.headers['content-type']).toContain('application/json');
        expect(JSON.parse(invalid.body)).toEqual({ error: 'Bad Request' });
        const failed = await post(port, '{}', '/failure');
        expect(failed.status).toBe(429);
        expect(JSON.parse(failed.body)).toEqual({ error: 'Too Many Requests' });
        expect(failed.headers['retry-after']).toBe('3');
        expect(failed.headers['www-authenticate']).toBe('Bearer');
        expect(failed.headers['set-cookie']).toEqual(['a=1', 'b=2']);
      });
      expect(messages.join('\n')).toContain('SyntaxError');
      expect(messages.join('\n')).toContain('legacy diagnostic');
      expect(messages.join('\n')).not.toContain(CANARY);
    },
  );

  it.each([
    ['response', 'identity'],
    ['response', 'gzip'],
    ['error', 'identity'],
    ['error', 'gzip'],
  ])(
    'replaces stale %s headers and negotiates %s for the public JSON body',
    async (headerSource, encoding) => {
      const app = express();
      app.use(compression({ threshold: 0 }));
      app.post('/', (_req, res) => {
        res.set({
          'Content-Encoding': 'br',
          'Content-Language': 'fr',
          'Content-Range': 'bytes 0-9/100',
          'Content-Length': '10',
          'Content-Type': 'text/plain',
        });
        throw Object.assign(new Error('legacy diagnostic'), {
          status: 429,
          headers: {
            ...(headerSource === 'error'
              ? {
                  'cOnTeNt-EnCoDiNg': 'gzip',
                  'CONTENT-LANGUAGE': 'de',
                  'cOnTeNt-RaNgE': 'bytes 20-29/100',
                  'content-LENGTH': '999',
                  'CONTENT-type': 'application/octet-stream',
                }
              : {}),
            'Retry-After': '3',
            'WWW-Authenticate': 'Bearer',
            'Set-Cookie': ['a=1', 'b=2'],
            'X-Error-Id': 'retry-request',
          },
        });
      });
      app.use(handler);

      await withServer(app, async (port) => {
        const response = await post(port, '{}', '/', { 'Accept-Encoding': encoding });
        expect(response.status).toBe(429);
        const body = encoding === 'gzip' ? gunzipSync(response.rawBody) : response.rawBody;
        expect(JSON.parse(body.toString('utf8'))).toEqual({ error: 'Too Many Requests' });
        expect(response.headers['content-encoding']).toBe(encoding === 'gzip' ? 'gzip' : undefined);
        expect(response.headers['content-language']).toBeUndefined();
        expect(response.headers['content-range']).toBeUndefined();
        expect(response.headers['content-type']).toContain('application/json');
        if (encoding === 'identity') {
          expect(response.headers['content-length']).toBe(String(response.rawBody.length));
        } else {
          expect(response.headers['content-length']).toBeUndefined();
        }
        expect(response.headers['retry-after']).toBe('3');
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(response.headers['set-cookie']).toEqual(['a=1', 'b=2']);
        expect(response.headers['x-error-id']).toBe('retry-request');
      });
    },
  );

  it('uses statusCode after an invalid status and copies only valid response header values', async () => {
    const messages: string[] = [];
    setLogCallback((message) => messages.push(message));
    const app = express();
    app.post('/', () => {
      const error = Object.assign(new Error('legacy diagnostic'), {
        status: 200,
        statusCode: 401,
        headers: {
          'WWW-Authenticate': 'Bearer',
          'Retry-After': 3,
          'X-Object': { body: CANARY },
          'X-Mixed-Array': ['value', { body: CANARY }],
        },
      });
      error.stack = 'Error: legacy diagnostic';
      throw error;
    });
    app.use(handler);

    await withServer(app, async (port) => {
      const response = await post(port, '{}');
      expect(response.status).toBe(401);
      expect(JSON.parse(response.body)).toEqual({ error: 'Unauthorized' });
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.headers['retry-after']).toBe('3');
      expect(response.headers['x-object']).toBeUndefined();
      expect(response.headers['x-mixed-array']).toBeUndefined();
    });
    expect(messages.join('\n')).toContain('legacy diagnostic');
    expect(messages.join('\n')).not.toContain(CANARY);
  });

  it.each([
    { status: 503, message: 'Service Unavailable' },
    { status: 200, message: 'Internal Server Error' },
  ])(
    'handles a primitive error with existing response status $status',
    async ({ status, message }) => {
      const messages: string[] = [];
      setLogCallback((diagnostic) => messages.push(diagnostic));
      const app = express();
      app.post('/', (_req, res, next) => {
        res.status(status);
        next('legacy primitive diagnostic');
      });
      app.use(handler);

      await withServer(app, async (port) => {
        const response = await post(port, '{}');
        expect(response.status).toBe(status === 503 ? 503 : 500);
        expect(JSON.parse(response.body)).toEqual({ error: message });
      });
      expect(messages.join('\n')).toContain('legacy primitive diagnostic');
    },
  );

  it('returns safe JSON and a fixed diagnostic when error rendering throws', async () => {
    const messages: string[] = [];
    setLogCallback((message) => messages.push(message));
    const app = express();
    app.post('/', () => {
      const error = Object.assign(new Error('original diagnostic'), { body: CANARY });
      Object.defineProperty(error, 'stack', {
        get() {
          throw new Error(CANARY);
        },
      });
      throw error;
    });
    app.use(handler);

    await withServer(app, async (port) => {
      const response = await post(port, '{}');
      expect(response.status).toBe(500);
      expect(JSON.parse(response.body)).toEqual({ error: 'Internal Server Error' });
    });
    expect(messages.join('\n')).toContain('Error: Unable to format HTTP error');
    expect(messages.join('\n')).not.toContain(CANARY);
    expect(messages.join('\n')).not.toContain('original diagnostic');
  });

  it('detaches late errors without inspecting their attached objects or logging twice', () => {
    const inspect = vi.fn(() => CANARY);
    const messages: string[] = [];
    setLogCallback((message) => messages.push(message));
    const original = Object.assign(new Error('legacy diagnostic'), {
      body: CANARY,
      cause: new Error(CANARY),
      status: 401,
      headers: { 'WWW-Authenticate': ['Bearer'] },
      [Symbol.for('nodejs.util.inspect.custom')]: inspect,
    });
    original.stack = 'Error: legacy diagnostic';
    const next = vi.fn();
    handler(original, {} as express.Request, { headersSent: true } as Response, next);
    const forwarded = next.mock.calls[0][0];
    expect(forwarded).not.toBe(original);
    expect(forwarded.stack).toBe(original.stack);
    expect(forwarded.headers).toEqual(original.headers);
    expect(forwarded.headers).not.toBe(original.headers);
    expect(forwarded.headers['WWW-Authenticate']).not.toBe(original.headers['WWW-Authenticate']);
    expect(format(forwarded)).not.toContain(CANARY);
    expect(forwarded.body).toBeUndefined();
    expect(forwarded.cause).toBeUndefined();
    expect(inspect).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });
});

describe('Express response compatibility', () => {
  it('sends chunked text without Content-Length while retaining parameters and ETag', async () => {
    const app = express();
    app.post('/', (_req, res) => {
      res.set('Transfer-Encoding', 'chunked');
      res.set('Content-Type', 'text/plain; profile=demo; charset=iso-8859-1');
      res.send('hello');
    });
    await withServer(app, async (port) => {
      const response = await post(port, '{}');
      expect(response.status).toBe(200);
      expect(response.body).toBe('hello');
      expect(response.headers['transfer-encoding']).toBe('chunked');
      expect(response.headers['content-length']).toBeUndefined();
      expect(response.headers['content-type']).toContain('profile=demo');
      expect(response.headers['content-type']).toContain('charset=utf-8');
      expect(response.headers.etag).toBeTruthy();
    });
  });

  it.each(['report.txt', 'report résumé.txt'])(
    'creates an attachment header for %s',
    async (filename) => {
      const app = express();
      app.post('/', (_req, res) => res.attachment(filename).send('hello'));
      await withServer(app, async (port) => {
        const response = await post(port, '{}');
        expect(response.status).toBe(200);
        expect(response.body).toBe('hello');
        expect(response.headers['content-disposition']).toMatch(/^attachment; filename=/);
        if (filename === 'report.txt') {
          expect(response.headers['content-disposition']).toContain('filename=report.txt');
        } else {
          expect(response.headers['content-disposition']).toContain(
            `filename*=UTF-8''${encodeURIComponent(filename)}`,
          );
        }
      });
    },
  );
});

const examples = [
  'config-stateful-session-management',
  'redteam-medical-agent/src',
  'redteam-tracing-example',
  'redteam-chatbot',
  'provider-http/auth-signature',
  'provider-http/auth-signature-jks',
  'provider-http/auth-signature-pfx',
  'config-websockets/streaming/server',
  'claude-agent-sdk/working-dir/sample-project',
];

describe.each(examples)('standalone error adapter: %s', (example) => {
  it('preserves the default response and diagnostic without logging the attached body', async () => {
    // Import the shipped module itself: examples must work after init --example.
    const handler = require(
      fileURLToPath(
        new URL(`../../../examples/${example}/defaultErrorHandler.cjs`, import.meta.url),
      ),
    ) as ErrorRequestHandler;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = express();
    app.set('env', 'production');
    app.use(express.json());
    app.post('/', (req, res) => res.json({ value: req.body.value }));
    app.use(handler);
    await withServer(app, async (port) => {
      const valid = await post(port, '{"value":"ok"}');
      expect(valid.status).toBe(200);
      expect(JSON.parse(valid.body)).toEqual({ value: 'ok' });
      const invalid = await post(port, malformed);
      expect(invalid.status).toBe(400);
      expect(invalid.headers['content-type']).toContain('text/html');
      expect(invalid.body).toContain('Bad Request');
      expect(invalid.body).not.toContain(CANARY);
    });
    const diagnostic = log.mock.calls.map((args) => format(...args)).join('\n');
    expect(diagnostic).toContain('SyntaxError');
    expect(diagnostic).not.toContain(CANARY);
  });
});
