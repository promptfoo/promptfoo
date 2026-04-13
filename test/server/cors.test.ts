import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/envars', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/envars')>()),
  getEnvString: vi.fn(
    (key: string, defaultValue?: string) => process.env[key] ?? defaultValue ?? '',
  ),
}));

import {
  createApp,
  isSocketIoOriginAllowed,
  localCorsOptionsDelegate,
} from '../../src/server/server';
import type { Request } from 'express';

const PROXY_ENV_VARS = [
  'ALL_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'all_proxy',
  'http_proxy',
  'https_proxy',
];

async function getCorsOriginForHeaders(headers: Request['headers']): Promise<unknown> {
  return new Promise((resolve, reject) => {
    localCorsOptionsDelegate({ headers } as Request, (error, options) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(options?.origin);
    });
  });
}

describe('server CORS', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    for (const key of PROXY_ENV_VARS) {
      vi.stubEnv(key, '');
    }
    vi.stubEnv('PROMPTFOO_CSRF_ALLOWED_ORIGINS', '');
    app = createApp();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not expose local API responses to hostile browser origins', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.example');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not trust arbitrary same-host browser origins', async () => {
    await expect(
      getCorsOriginForHeaders({
        origin: 'https://evil.example',
        host: 'evil.example:15500',
      }),
    ).resolves.toBe(false);
  });

  it('allows localhost browser origins', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000')
      .set('Host', '127.0.0.1:15500');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  it('allows IPv6 loopback browser origins', async () => {
    const response = await request(app)
      .get('/health')
      .set('Origin', 'http://[::1]:3000')
      .set('Host', '[::1]:15500');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('http://[::1]:3000');
  });

  it('keeps non-browser clients working without CORS headers', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows configured browser origins', async () => {
    vi.stubEnv('PROMPTFOO_CSRF_ALLOWED_ORIGINS', 'https://allowed.example');

    const response = await request(app)
      .get('/health')
      .set('Origin', 'https://allowed.example')
      .set('Host', 'localhost:15500');

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://allowed.example');
  });

  it('uses the same allow policy for Socket.IO origins', () => {
    expect(isSocketIoOriginAllowed('https://evil.example', 15500)).toBe(false);
    expect(isSocketIoOriginAllowed('http://localhost:3000', 15500)).toBe(true);
    expect(isSocketIoOriginAllowed(undefined, 15500)).toBe(true);
  });
});
