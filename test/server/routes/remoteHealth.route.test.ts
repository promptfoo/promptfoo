import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/apiHealth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/util/apiHealth')>();
  return {
    ...actual,
    checkRemoteHealth: vi.fn(),
  };
});

import { createApp } from '../../../src/server/server';
import { checkRemoteHealth } from '../../../src/util/apiHealth';
import { mockProcessEnv } from '../../util/utils';

const mockedCheckRemoteHealth = vi.mocked(checkRemoteHealth);

describe('Remote Health Route', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = createApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  it('returns DISABLED without upstream egress in no-network mode', async () => {
    const restoreEnv = mockProcessEnv({ PROMPTFOO_NO_NETWORK: 'true' });
    try {
      const response = await request(app).get('/api/remote-health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ status: 'DISABLED' });
      // The upstream health check must never fire: no-network mode
      // promises zero non-eval egress, and the web UI polls this route
      // every 3 seconds.
      expect(mockedCheckRemoteHealth).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it.each(['/', '/%69ndex.html', '/%2e%2findex%2ehtml', '//index.html', '/eval/recent'])(
    'serves the marked entry page for %s in no-network mode',
    async (url) => {
      const restore = mockProcessEnv({ PROMPTFOO_NO_NETWORK: 'true' });
      try {
        const response = await request(createApp()).get(url);
        expect(response.status).toBe(200);
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.text).toContain('<meta name="promptfoo-no-network">');
      } finally {
        restore();
      }
    },
  );

  it('serves HEAD metadata for encoded entry paths and leaves POST to the router', async () => {
    const restore = mockProcessEnv({ PROMPTFOO_NO_NETWORK: 'true' });
    try {
      const server = request(createApp());
      const head = await server.head('/%69ndex.html');
      expect(head.status).toBe(200);
      expect(head.headers['cache-control']).toBe('no-store');
      expect(head.headers['content-type']).toMatch(/^text\/html/);
      expect(head.text).toBeUndefined();
      expect((await server.post('/%69ndex.html')).status).toBe(404);
    } finally {
      restore();
    }
  });

  it('preserves static cache headers and conditional requests on normal client routes', async () => {
    const restore = mockProcessEnv({ PROMPTFOO_NO_NETWORK: undefined });
    try {
      const server = request(createApp());
      const entry = await server.get('/index.html');
      const nested = await server.get('/eval/recent?tab=results');
      expect(nested.status).toBe(200);
      expect(nested.text).toBe(entry.text);
      expect(nested.headers.etag).toBeTruthy();
      expect(nested.headers.etag).toBe(entry.headers.etag);
      expect(nested.headers['cache-control']).toBe(entry.headers['cache-control']);
      const head = await server.head('/eval/recent');
      expect(head.status).toBe(200);
      expect(Number(head.headers['content-length'])).toBe(Buffer.byteLength(entry.text));
      expect(head.text).toBeUndefined();
      const fresh = await server.get('/eval/recent').set('If-None-Match', entry.headers.etag);
      expect(fresh.status).toBe(304);
    } finally {
      restore();
    }
  });

  it('checks upstream health when no-network mode is off', async () => {
    const restoreEnv = mockProcessEnv({
      PROMPTFOO_NO_NETWORK: undefined,
      PROMPTFOO_DISABLE_REMOTE_GENERATION: undefined,
      PROMPTFOO_DISABLE_REDTEAM_REMOTE_GENERATION: undefined,
      PROMPTFOO_REMOTE_GENERATION_URL: 'https://example.test',
    });
    mockedCheckRemoteHealth.mockResolvedValue({ status: 'OK', message: 'healthy' });
    try {
      const response = await request(app).get('/api/remote-health');

      expect(response.body).toMatchObject({ status: 'OK', message: 'healthy' });
      expect(mockedCheckRemoteHealth).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnv();
    }
  });
});
