import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudConfig } from '../../../src/globalConfig/cloud';
import { createApp } from '../../../src/server/server';
import { setupTestServer } from '../../util/testServer';

describe('local Cloud proxy previews', () => {
  const api = setupTestServer(createApp);
  const requests: string[] = [];
  const authenticatedRequests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url ?? '');
    if (req.headers.authorization === 'Bearer fixture-key') {
      authenticatedRequests.push(req.url ?? '');
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/alias') {
      res.writeHead(307, { Location: '/api/v1/http-provider-generator' });
    }
    res.end(JSON.stringify({ status: 'OK', output: 'local response' }));
  });
  let origin: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  beforeEach(() => {
    requests.length = 0;
    authenticatedRequests.length = 0;
    vi.spyOn(CloudConfig.prototype, 'getApiHost').mockReturnValue(origin);
    vi.spyOn(CloudConfig.prototype, 'getApiKey').mockReturnValue('fixture-key');
    vi.stubEnv('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY', undefined);
    vi.stubEnv('PROMPTFOO_REMOTE_GENERATION_URL', `${origin}/api/v1/task`);
    vi.stubEnv('PROMPTFOO_CACHE_ENABLED', 'false');
    vi.stubEnv('NO_PROXY', '127.0.0.1');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(['/api/v1/task', '/on-prem/custom-task'])(
    'denies remote-only plugin generation at %s',
    async (path) => {
      vi.stubEnv('PROMPTFOO_REMOTE_GENERATION_URL', `${origin}${path}`);
      const response = await api.post('/api/redteam/generate-test').send({
        plugin: { id: 'ascii-smuggling' },
        strategy: { id: 'basic' },
        config: { applicationDefinition: { purpose: 'Test assistant' } },
        provider: 'echo',
      });
      expect(response.status).toBe(403);
      expect(requests).not.toContain(path);
    },
  );

  it.each(['/api/v1/http-provider-generator', '/alias'])(
    'denies HTTP provider tests reaching the generator through %s',
    async (path) => {
      vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
      const response = await api.post('/api/providers/test').send({
        providerOptions: {
          id: `${origin}${path}`,
          config: { method: 'POST', body: { requestExample: 'fixture' } },
        },
      });
      expect(response.status).toBe(403);
      expect(requests).not.toContain('/api/v1/http-provider-generator');
    },
  );

  it('allows the protected destination after process opt-in', async () => {
    vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
    vi.stubEnv('PROMPTFOO_ALLOW_LOCAL_CLOUD_PROXY', 'true');
    const response = await api.post('/api/providers/test').send({
      providerOptions: {
        id: `${origin}/api/v1/http-provider-generator`,
        config: { method: 'POST', body: { requestExample: 'fixture' } },
      },
    });
    expect(response.status).toBe(200);
    expect(authenticatedRequests).toContain('/api/v1/http-provider-generator');
  });

  it('still tests an ordinary HTTP provider on a different origin', async () => {
    vi.spyOn(CloudConfig.prototype, 'getApiHost').mockReturnValue('https://cloud.example');
    vi.stubEnv('PROMPTFOO_DISABLE_REMOTE_GENERATION', 'true');
    const response = await api.post('/api/providers/test').send({
      providerOptions: {
        id: `${origin}/api/v1/http-provider-generator`,
        config: { method: 'POST', body: { requestExample: 'fixture' } },
      },
    });
    expect(response.status).toBe(200);
    expect(response.body.testResult.success).toBe(true);
    expect(requests).toEqual(['/api/v1/http-provider-generator']);
    expect(authenticatedRequests).toEqual([]);
  });
});
