import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, getRequestSizeLimit } from '../../src/server/server';
import { mockProcessEnv } from '../util/utils';

describe('server request size limit', () => {
  let restoreEnv: (() => void) | undefined;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = undefined;
  });

  it('defaults to 100mb', () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_REQUEST_SIZE_LIMIT: undefined });
    expect(getRequestSizeLimit()).toBe('100mb');
  });

  it('uses PROMPTFOO_REQUEST_SIZE_LIMIT when set', () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_REQUEST_SIZE_LIMIT: ' 10mb ' });
    expect(getRequestSizeLimit()).toBe('10mb');
  });

  it('falls back to the default for an empty value', () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_REQUEST_SIZE_LIMIT: '  ' });
    expect(getRequestSizeLimit()).toBe('100mb');
  });

  it('rejects JSON bodies larger than the configured limit with 413', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_REQUEST_SIZE_LIMIT: '1kb' });
    const app = createApp();
    const res = await request(app)
      .post('/api/request-size-limit-probe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(4096) }));
    expect(res.status).toBe(413);
  });

  it('rejects urlencoded bodies larger than the configured limit with 413', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_REQUEST_SIZE_LIMIT: '1kb' });
    const app = createApp();
    const res = await request(app)
      .post('/api/request-size-limit-probe')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send(`data=${'x'.repeat(4096)}`);
    expect(res.status).toBe(413);
  });

  it('accepts the same body under the default limit', async () => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_REQUEST_SIZE_LIMIT: undefined });
    const app = createApp();
    const res = await request(app)
      .post('/api/request-size-limit-probe')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(4096) }));
    expect(res.status).not.toBe(413);
  });
});
