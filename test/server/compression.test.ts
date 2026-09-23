import { randomBytes } from 'node:crypto';
import { get } from 'node:http';
import { createRequire } from 'node:module';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import compression from 'compression';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const zlib = require('node:zlib') as typeof import('node:zlib');

describe('server response compression', () => {
  let server: Server | undefined;
  const originalCreateGzip = zlib.createGzip;

  afterEach(async () => {
    Object.defineProperty(zlib, 'createGzip', {
      configurable: true,
      value: originalCreateGzip,
    });

    if (server?.listening) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('destroys the compressor when a client aborts a streaming response', async () => {
    let compressor: ReturnType<typeof zlib.createGzip> | undefined;
    Object.defineProperty(zlib, 'createGzip', {
      configurable: true,
      value: (...args: Parameters<typeof zlib.createGzip>) => {
        compressor = originalCreateGzip(...args);
        return compressor;
      },
    });

    let resolveResponseClosed: (() => void) | undefined;
    let rejectResponseClosed: ((error: unknown) => void) | undefined;
    const responseClosed = new Promise<void>((resolve, reject) => {
      resolveResponseClosed = resolve;
      rejectResponseClosed = reject;
    });

    const app = express();
    app.use(compression());
    app.get('/compression-abort-test', (_req, res) => {
      res.type('text/plain');
      const writeChunk = () => {
        if (!res.destroyed) {
          res.write(randomBytes(64 * 1024));
        }
      };
      writeChunk();
      const interval = setInterval(writeChunk, 5);

      res.once('close', () => {
        clearInterval(interval);
        try {
          expect(compressor).toBeDefined();
          expect(compressor?.destroyed).toBe(true);
          resolveResponseClosed?.();
        } catch (error) {
          rejectResponseClosed?.(error);
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', (error?: Error) => (error ? reject(error) : resolve()));
    });
    if (!server) {
      throw new Error('Compression test server did not start');
    }

    const port = (server.address() as AddressInfo).port;

    await new Promise<void>((resolve, reject) => {
      let receivedResponse = false;
      const request = get(
        {
          host: '127.0.0.1',
          port,
          path: '/compression-abort-test',
          headers: { 'Accept-Encoding': 'gzip' },
        },
        (response) => {
          receivedResponse = true;
          response.once('error', () => {});
          response.once('data', () => {
            response.destroy();
            resolve();
          });
        },
      );
      request.once('error', (error) => {
        if (!receivedResponse) {
          reject(error);
        }
      });
    });

    await responseClosed;
  });
});
