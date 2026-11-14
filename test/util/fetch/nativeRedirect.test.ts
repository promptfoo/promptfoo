import http from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAgentCache, fetchWithProxy } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../utils';

/**
 * Native-fetch redirect behavior with a real Request body. Unlike the
 * guarded-redirect suite next door (which mocks the fetch layer), this file
 * drives a live loopback server: outside a guarded server-route context,
 * `fetchWithProxy(new Request(...))` must hand the Request to native fetch
 * untouched, so a 307/308 replay keeps the POST body. Seeding the Request's
 * live stream into init.body breaks that replay: the stream is disturbed
 * after the first hop and the redirect fails.
 */
describe('fetchWithProxy unguarded Request redirects', () => {
  let restoreEnv: (() => void) | undefined;
  let server: http.Server;
  let port: number;
  let hits: string[];

  beforeEach(async () => {
    hits = [];
    await new Promise<void>((resolve) => {
      server = http.createServer((req, res) => {
        hits.push(`${req.method} ${req.url}`);
        if (req.url === '/start307') {
          res.writeHead(307, { location: '/final' });
          res.end();
          return;
        }
        if (req.url === '/start308') {
          res.writeHead(308, { location: '/final' });
          res.end();
          return;
        }
        if (req.url === '/final') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            res.writeHead(200, { 'content-type': 'text/plain' });
            res.end(`got:${body}`);
          });
          return;
        }
        res.writeHead(404);
        res.end();
      });
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    vi.resetAllMocks();
    restoreEnv?.();
    restoreEnv = undefined;
    clearAgentCache();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it.each([307, 308])(
    'replays a Request POST body across a %s outside the guard context',
    async (status) => {
      // The flag is set but no guard context is active: an eval-style call
      // in the same process must keep native redirect handling.
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
      const request = new Request(`http://127.0.0.1:${port}/start${status}`, {
        method: 'POST',
        body: 'x',
      });
      const response = await fetchWithProxy(request);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('got:x');
      expect(hits).toEqual([`POST /start${status}`, 'POST /final']);
    },
  );
});
