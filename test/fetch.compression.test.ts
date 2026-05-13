import { createServer, type Server } from 'node:http';
import { brotliCompressSync, gzipSync } from 'node:zlib';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAgentCache, fetchWithProxy } from '../src/util/fetch/index';
import { mockProcessEnv, PROXY_ENV_KEYS } from './util/utils';

type SupportedEncoding = 'br' | 'gzip';

const payload = {
  ok: true,
  message: 'compressed response '.repeat(24),
};

let restoreProxyEnv = () => {};
let server: Server | undefined;

async function startCompressedServer(encoding: SupportedEncoding): Promise<string> {
  const compressedBody =
    encoding === 'br'
      ? brotliCompressSync(Buffer.from(JSON.stringify(payload)))
      : gzipSync(Buffer.from(JSON.stringify(payload)));

  server = createServer((_req, res) => {
    res.writeHead(200, {
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

  it.each<SupportedEncoding>([
    'gzip',
    'br',
  ])('returns decoded JSON for %s responses', async (encoding) => {
    const url = await startCompressedServer(encoding);
    const response = await fetchWithProxy(url);
    const text = await response.text();

    expect(JSON.parse(text)).toEqual(payload);
  });
});
