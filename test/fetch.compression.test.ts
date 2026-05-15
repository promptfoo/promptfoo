import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAgentCache, fetchWithProxy } from '../src/util/fetch/index';
import { decompressResponseIfNeeded } from '../src/util/fetch/monkeyPatchFetch';
import { mockProcessEnv, PROXY_ENV_KEYS } from './util/utils';

type SupportedEncoding = 'br' | 'deflate' | 'gzip';
type SupportedStatus = 200 | 500;

const payload = {
  ok: true,
  message: 'compressed response '.repeat(24),
};

function compress(encoding: SupportedEncoding, raw: Buffer): Buffer {
  switch (encoding) {
    case 'br':
      return brotliCompressSync(raw);
    case 'deflate':
      return deflateSync(raw);
    case 'gzip':
      return gzipSync(raw);
  }
}

let restoreProxyEnv = () => {};
let server: Server | undefined;

async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<string> {
  server = createServer(handler);
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }
  return `http://127.0.0.1:${address.port}/compressed`;
}

async function startCompressedServer(
  encoding: SupportedEncoding,
  statusCode: SupportedStatus,
  options: { chunked?: boolean } = {},
): Promise<string> {
  const body = compress(encoding, Buffer.from(JSON.stringify(payload)));
  return startServer((_req, res) => {
    const headers: Record<string, string> = {
      'content-encoding': encoding,
      'content-type': 'application/json',
    };
    if (!options.chunked) {
      headers['content-length'] = String(body.length);
    }
    res.writeHead(statusCode, headers);

    if (options.chunked) {
      // Force chunked transfer-encoding by emitting in two writes without content-length.
      const mid = Math.max(1, Math.floor(body.length / 2));
      res.write(body.subarray(0, mid));
      res.end(body.subarray(mid));
    } else {
      res.end(body);
    }
  });
}

describe('fetchWithProxy compressed responses', () => {
  beforeEach(() => {
    restoreProxyEnv = mockProcessEnv(
      Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])),
    );
  });

  afterEach(async () => {
    restoreProxyEnv();
    clearAgentCache();

    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
  });

  it.each([
    ['gzip', 200],
    ['br', 200],
    ['deflate', 200],
    ['gzip', 500],
    ['br', 500],
  ] as const)('decodes %s responses with HTTP %s', async (encoding, statusCode) => {
    const url = await startCompressedServer(encoding, statusCode);
    const response = await fetchWithProxy(url);
    const ceHeader = response.headers.get('content-encoding');
    const text = await response.text();
    expect(response.status).toBe(statusCode);

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      // Surface enough state when this fails on a future Node version for the
      // monkeyPatchFetch fallback to be diagnosed.
      const head = Buffer.from(text).subarray(0, 16).toString('hex');
      throw new Error(
        `JSON.parse failed for ${encoding}/${statusCode}: ${(error as Error).message}. ` +
          `content-encoding-after-fetch=${ceHeader}, first-16-bytes=${head}, text-length=${text.length}`,
      );
    }
    expect(parsed).toEqual(payload);
  });

  it.each([
    'gzip',
    'br',
    'deflate',
  ] as const)('strips Content-Encoding after decoding successful %s responses', async (encoding) => {
    // For 2xx responses the decompress interceptor decodes the body and
    // removes the Content-Encoding header so downstream code does not
    // double-decode. (Non-2xx responses are decoded by Node's fetch and may
    // retain the header — body decoding is still correct.)
    const url = await startCompressedServer(encoding, 200);
    const response = await fetchWithProxy(url);
    await response.text();
    expect(response.headers.get('content-encoding')).toBeNull();
  });

  it.each([
    'gzip',
    'br',
    'deflate',
  ] as const)('decodes chunked %s responses (no Content-Length)', async (encoding) => {
    const url = await startCompressedServer(encoding, 200, { chunked: true });
    const response = await fetchWithProxy(url);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual(payload);
    expect(response.headers.get('content-encoding')).toBeNull();
  });

  it('decodes responses when the caller passes a native Request', async () => {
    const url = await startCompressedServer('gzip', 200);
    const response = await fetchWithProxy(new Request(url));

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual(payload);
  });

  it('preserves streamed native Request bodies on the pooled dispatcher path', async () => {
    let received = '';
    const url = await startServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        received = Buffer.concat(chunks).toString('utf8');
        const body = gzipSync(Buffer.from(JSON.stringify(payload)));
        res.writeHead(200, {
          'content-encoding': 'gzip',
          'content-length': String(body.length),
          'content-type': 'application/json',
        });
        res.end(body);
      });
    });

    const response = await fetchWithProxy(
      new Request(url, { method: 'POST', body: 'hello-streamed' }),
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual(payload);
    expect(received).toBe('hello-streamed');
  });

  it('lets callers clear an inherited aborted signal with signal: null', async () => {
    const url = await startCompressedServer('gzip', 200);
    const controller = new AbortController();
    controller.abort();

    const response = await fetchWithProxy(new Request(url, { signal: controller.signal }), {
      signal: null,
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual(payload);
  });
});

describe('decompressResponseIfNeeded', () => {
  // Direct unit coverage for the fallback decoder. The fallback exists because
  // some Node versions return raw compressed bytes even with the dispatcher's
  // decompress interceptor composed (observed on Node 26 + Brotli + non-2xx).
  // These tests fake that situation by constructing Responses that pair a
  // Content-Encoding header with a compressed (or pre-decoded) body.

  function makeResponse(body: Buffer | string, encoding: string | null, status = 200): Response {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (encoding) {
      headers.set('content-encoding', encoding);
      headers.set(
        'content-length',
        String(typeof body === 'string' ? body.length : body.byteLength),
      );
    }
    return new Response(body as BodyInit, { status, headers });
  }

  it.each([
    ['gzip', (raw: Buffer) => gzipSync(raw)],
    ['x-gzip', (raw: Buffer) => gzipSync(raw)],
    ['deflate', (raw: Buffer) => deflateSync(raw)],
    ['br', (raw: Buffer) => brotliCompressSync(raw)],
  ] as const)('decodes raw %s bodies and strips encoding headers', async (encoding, compress) => {
    const raw = Buffer.from(JSON.stringify(payload));
    const response = makeResponse(compress(raw), encoding, 500);

    const decoded = await decompressResponseIfNeeded(response);

    expect(JSON.parse(await decoded.text())).toEqual(payload);
    expect(decoded.headers.get('content-encoding')).toBeNull();
    expect(decoded.headers.get('content-length')).toBeNull();
    expect(decoded.headers.get('content-type')).toBe('application/json');
    expect(decoded.status).toBe(500);
  });

  it('returns the original bytes when the body is already decoded', async () => {
    // Simulates Node's bundled fetch decoding the body but preserving the
    // Content-Encoding header — the decoder errors on missing magic bytes and
    // the fallback hands the caller the already-decoded payload.
    const response = makeResponse(JSON.stringify(payload), 'gzip', 500);
    const out = await decompressResponseIfNeeded(response);
    expect(JSON.parse(await out.text())).toEqual(payload);
  });

  it('is a no-op when no Content-Encoding header is set', async () => {
    const response = makeResponse(JSON.stringify(payload), null);
    const out = await decompressResponseIfNeeded(response);
    expect(out).toBe(response);
  });

  it('is a no-op for unknown Content-Encoding values', async () => {
    const response = makeResponse(JSON.stringify(payload), 'identity');
    const out = await decompressResponseIfNeeded(response);
    expect(out).toBe(response);
    expect(out.headers.get('content-encoding')).toBe('identity');
  });

  it('handles empty bodies without throwing', async () => {
    const response = new Response(null, {
      status: 204,
      headers: { 'content-encoding': 'gzip' },
    });
    const out = await decompressResponseIfNeeded(response);
    expect(out.status).toBe(204);
  });

  it('passes through non-Response inputs (e.g. partial test mocks)', async () => {
    // Many tests mock fetch with plain `{ ok, json }` stubs that omit headers
    // and arrayBuffer. The helper must not call .headers.get on those.
    const fakeMock = { ok: true, json: () => Promise.resolve({}) } as unknown as Response;
    const out = await decompressResponseIfNeeded(fakeMock);
    expect(out).toBe(fakeMock);
  });
});
