import { createServer, type Server } from 'node:http';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAgentCache, fetchWithProxy } from '../src/util/fetch/index';
import { mockProcessEnv, PROXY_ENV_KEYS } from './util/utils';

type SupportedEncoding = 'br' | 'gzip';
type SupportedStatus = 200 | 500;

const payload = {
  ok: true,
  message: 'compressed response '.repeat(24),
};

let restoreProxyEnv = () => {};
let server: Server | undefined;

async function startCompressedServer(
  encoding: SupportedEncoding,
  statusCode: SupportedStatus,
): Promise<string> {
  const compressedBody =
    encoding === 'br'
      ? brotliCompressSync(Buffer.from(JSON.stringify(payload)))
      : gzipSync(Buffer.from(JSON.stringify(payload)));

  server = createServer((_req, res) => {
    res.writeHead(statusCode, {
      'content-encoding': encoding,
      'content-length': String(compressedBody.length),
      'content-type': 'application/json',
    });
    res.end(compressedBody);
  });

  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind compressed-response test server');
  }

  return `http://127.0.0.1:${address.port}/compressed`;
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
        server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      server = undefined;
    }
  });

  it.each([
    ['gzip', 200],
    ['br', 200],
    ['gzip', 500],
    ['br', 500],
  ] as const)('returns decoded JSON for %s responses with HTTP %s', async (encoding, statusCode) => {
    const url = await startCompressedServer(encoding, statusCode);
    const response = await fetchWithProxy(url);
    const text = await response.text();

    expect(response.status).toBe(statusCode);
    expect(JSON.parse(text)).toEqual(payload);
  });

  it('returns decoded JSON for native Request inputs on the pooled dispatcher path', async () => {
    const url = await startCompressedServer('gzip', 200);
    const response = await fetchWithProxy(new Request(url));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual(payload);
  });

  it('preserves streamed native Request bodies on the pooled dispatcher path', async () => {
    const url = await startCompressedServer('gzip', 200);
    const response = await fetchWithProxy(
      new Request(url, {
        method: 'POST',
        body: 'hello',
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual(payload);
  });
});
