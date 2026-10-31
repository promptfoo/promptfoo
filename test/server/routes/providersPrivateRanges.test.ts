import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/providers/index', () => ({
  loadApiProvider: vi.fn(),
}));
vi.mock('../../../src/node/testProvider', () => ({
  testProviderConnectivity: vi.fn(),
  testProviderSession: vi.fn(),
}));
vi.mock('../../../src/redteam/commands/discover', () => ({
  doTargetPurposeDiscovery: vi.fn(),
}));
vi.mock('../../../src/redteam/remoteGeneration', () => ({
  neverGenerateRemote: vi.fn(() => false),
}));

import { testProviderConnectivity, testProviderSession } from '../../../src/node/testProvider';
import { loadApiProvider } from '../../../src/providers/index';
import { doTargetPurposeDiscovery } from '../../../src/redteam/commands/discover';
import { createApp } from '../../../src/server/server';
import { isPrivateRangeGuardContextActive } from '../../../src/util/fetch/guardContext';
import { mockProcessEnv } from '../../util/utils';

const mockedLoadApiProvider = vi.mocked(loadApiProvider);
const mockedTestProviderConnectivity = vi.mocked(testProviderConnectivity);
const mockedTestProviderSession = vi.mocked(testProviderSession);
const mockedDoTargetPurposeDiscovery = vi.mocked(doTargetPurposeDiscovery);

describe('PROMPTFOO_BLOCK_PRIVATE_RANGES server guards (#11768 item 2)', () => {
  let app: ReturnType<typeof createApp>;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedTestProviderConnectivity.mockResolvedValue({
      success: true,
      message: 'ok',
    });
    mockedTestProviderSession.mockResolvedValue({ success: true, message: 'ok' } as never);
    mockedDoTargetPurposeDiscovery.mockResolvedValue({
      purpose: 'test purpose',
      limitations: null,
      user: null,
      tools: [],
    } as never);
    app = createApp();
  });

  afterEach(() => {
    restoreEnv?.();
    vi.resetAllMocks();
  });

  describe('POST /api/providers/test', () => {
    const body = { providerOptions: { id: 'http://169.254.169.254/v1' } };

    it('refuses a private target with 400 when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app).post('/api/providers/test').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PROMPTFOO_BLOCK_PRIVATE_RANGES');
      // No provider is loaded and no request is issued.
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
      expect(mockedTestProviderConnectivity).not.toHaveBeenCalled();
    });

    it('refuses a config.apiBaseUrl private target when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({
          providerOptions: { id: 'openai:chat', config: { apiBaseUrl: 'http://10.1.2.3/v1' } },
        });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('refuses a config.url private target (HttpProvider request URL) when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({
          providerOptions: { id: 'http', config: { url: 'http://127.0.0.1:8080/hook' } },
        });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('refuses a non-canonical http: provider id when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'http:127.0.0.1' } });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('refuses a named provider with a local default endpoint when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'ollama:chat:llama3' } });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('refuses an n8n: wrapped private target when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({
          providerOptions: { id: 'n8n:http://169.254.169.254/latest/meta-data' },
        });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('refuses an a2a: wrapped private target when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'a2a:http://127.0.0.1:8080' } });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('refuses litellm with its local proxy default when the flag is set', async () => {
      restoreEnv = mockProcessEnv({
        PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true',
        LITELLM_API_BASE: undefined,
      });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'litellm:chat:gpt-4o' } });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('refuses openclaw with its local gateway default when the flag is set', async () => {
      restoreEnv = mockProcessEnv({
        PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true',
        OPENCLAW_GATEWAY_URL: undefined,
        CLAWDBOT_GATEWAY_URL: undefined,
      });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'openclaw' } });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('proceeds for openclaw with a public gateway_url override when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({
          providerOptions: {
            id: 'openclaw:chat',
            config: { gateway_url: 'http://8.8.8.8:18789' },
          },
        });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });

    it('proceeds when the flag is unset (default local behavior)', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });

      const response = await request(app).post('/api/providers/test').send(body);

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });

    it('proceeds for named providers without overrides when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'openai:gpt-4o-mini' } });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });

    it('loads the provider inside the guard context when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
      let guardActiveDuringLoad: boolean | undefined;
      mockedLoadApiProvider.mockImplementation(() => {
        guardActiveDuringLoad = isPrivateRangeGuardContextActive();
        return Promise.resolve({} as never);
      });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'openai:gpt-4o-mini' } });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
      // Provider constructors can issue requests during load (e.g. elevenlabs
      // voice design), so loading must happen inside the guard context where
      // redirect validation applies.
      expect(guardActiveDuringLoad).toBe(true);
    });

    it('loads the provider outside the guard context when the flag is unset', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });
      let guardActiveDuringLoad: boolean | undefined;
      mockedLoadApiProvider.mockImplementation(() => {
        guardActiveDuringLoad = isPrivateRangeGuardContextActive();
        return Promise.resolve({} as never);
      });

      const response = await request(app)
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'openai:gpt-4o-mini' } });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
      expect(guardActiveDuringLoad).toBe(false);
    });

    it.each([
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host "noresolve.example.com" could not be resolved: getaddrinfo ENOTFOUND noresolve.example.com',
      'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host "internal.example.com" resolves to a private address',
    ])(
      'answers a downstream guard failure with the same generic 400: %s',
      async (failure) => {
        restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
        mockedTestProviderConnectivity.mockResolvedValue({
          success: false,
          message: `Provider returned error: ${failure}`,
          error: failure,
        });

        const response = await request(app)
          .post('/api/providers/test')
          .send({ providerOptions: { id: 'openai:gpt-4o-mini' } });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe(
          'Refused: PROMPTFOO_BLOCK_PRIVATE_RANGES is set and the provider target resolves to a private, loopback, or link-local address.',
        );
        // No residue of the detailed failure: unresolvable and
        // private-resolving hosts must be indistinguishable.
        expect(JSON.stringify(response.body)).not.toContain('could not be resolved');
        expect(JSON.stringify(response.body)).not.toContain('resolves to a private address');
        expect(JSON.stringify(response.body)).not.toContain('internal.example.com');
        expect(JSON.stringify(response.body)).not.toContain('noresolve.example.com');
      },
    );
  });

  describe('POST /api/providers/discover', () => {
    const body = { id: 'http://169.254.169.254/v1' };

    it('refuses a private target with 400 when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app).post('/api/providers/discover').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PROMPTFOO_BLOCK_PRIVATE_RANGES');
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
      expect(mockedDoTargetPurposeDiscovery).not.toHaveBeenCalled();
    });

    it('proceeds when the flag is unset (default local behavior)', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });

      const response = await request(app).post('/api/providers/discover').send(body);

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });

    it('loads the provider inside the guard context when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
      let guardActiveDuringLoad: boolean | undefined;
      mockedLoadApiProvider.mockImplementation(() => {
        guardActiveDuringLoad = isPrivateRangeGuardContextActive();
        return Promise.resolve({} as never);
      });

      const response = await request(app)
        .post('/api/providers/discover')
        .send({ id: 'openai:gpt-4o-mini' });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
      expect(guardActiveDuringLoad).toBe(true);
    });
  });

  describe('POST /api/providers/test-session', () => {
    const body = { provider: { id: 'http://169.254.169.254/v1' } };

    it('refuses a private target with 400 when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await request(app).post('/api/providers/test-session').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PROMPTFOO_BLOCK_PRIVATE_RANGES');
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
      expect(mockedTestProviderSession).not.toHaveBeenCalled();
    });

    it('proceeds when the flag is unset (default local behavior)', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });

      const response = await request(app).post('/api/providers/test-session').send(body);

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });

    it('loads the provider inside the guard context when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
      let guardActiveDuringLoad: boolean | undefined;
      mockedLoadApiProvider.mockImplementation(() => {
        guardActiveDuringLoad = isPrivateRangeGuardContextActive();
        return Promise.resolve({} as never);
      });

      const response = await request(app)
        .post('/api/providers/test-session')
        .send({ provider: { id: 'openai:gpt-4o-mini' } });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
      expect(guardActiveDuringLoad).toBe(true);
    });

    it('answers a downstream guard failure with the same generic 400', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });
      const failure =
        'PROMPTFOO_BLOCK_PRIVATE_RANGES is set: refusing to fetch provider URL whose host "internal.example.com" resolves to a private address';
      mockedTestProviderSession.mockResolvedValue({
        success: false,
        message: `First request failed: ${failure}`,
        error: failure,
        details: { response1: failure },
      } as never);

      const response = await request(app)
        .post('/api/providers/test-session')
        .send({ provider: { id: 'openai:gpt-4o-mini' } });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe(
        'Refused: PROMPTFOO_BLOCK_PRIVATE_RANGES is set and the provider target resolves to a private, loopback, or link-local address.',
      );
      expect(JSON.stringify(response.body)).not.toContain('internal.example.com');
      expect(JSON.stringify(response.body)).not.toContain('resolves to a private address');
    });
  });
});
