import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server/server';
import { setupTestServer } from '../../util/testServer';
import { mockProcessEnv } from '../../util/utils';

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

import { testProviderConnectivity } from '../../../src/node/testProvider';
import { loadApiProvider } from '../../../src/providers/index';
import { doTargetPurposeDiscovery } from '../../../src/redteam/commands/discover';

const mockedLoadApiProvider = vi.mocked(loadApiProvider);
const mockedTestProviderConnectivity = vi.mocked(testProviderConnectivity);
const mockedDoTargetPurposeDiscovery = vi.mocked(doTargetPurposeDiscovery);

describe('PROMPTFOO_BLOCK_PRIVATE_RANGES server guards (#11768 item 2)', () => {
  const api = setupTestServer(createApp);
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedTestProviderConnectivity.mockResolvedValue({
      success: true,
      message: 'ok',
    });
    mockedDoTargetPurposeDiscovery.mockResolvedValue({
      purpose: 'test purpose',
      limitations: null,
      user: null,
      tools: [],
    } as never);
  });

  afterEach(() => {
    restoreEnv?.();
    vi.resetAllMocks();
  });

  describe('POST /api/providers/test', () => {
    const body = { providerOptions: { id: 'http://169.254.169.254/v1' } };

    it('refuses a private target with 400 when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await api.post('/api/providers/test').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PROMPTFOO_BLOCK_PRIVATE_RANGES');
      // No provider is loaded and no request is issued.
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
      expect(mockedTestProviderConnectivity).not.toHaveBeenCalled();
    });

    it('refuses a config.apiBaseUrl private target when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await api
        .post('/api/providers/test')
        .send({
          providerOptions: { id: 'openai:chat', config: { apiBaseUrl: 'http://10.1.2.3/v1' } },
        });

      expect(response.status).toBe(400);
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
    });

    it('proceeds when the flag is unset (default local behavior)', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });

      const response = await api.post('/api/providers/test').send(body);

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });

    it('proceeds for named providers without overrides when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await api
        .post('/api/providers/test')
        .send({ providerOptions: { id: 'openai:gpt-4o-mini' } });

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });
  });

  describe('POST /api/providers/discover', () => {
    const body = { id: 'http://169.254.169.254/v1' };

    it('refuses a private target with 400 when the flag is set', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: 'true' });

      const response = await api.post('/api/providers/discover').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PROMPTFOO_BLOCK_PRIVATE_RANGES');
      expect(mockedLoadApiProvider).not.toHaveBeenCalled();
      expect(mockedDoTargetPurposeDiscovery).not.toHaveBeenCalled();
    });

    it('proceeds when the flag is unset (default local behavior)', async () => {
      restoreEnv = mockProcessEnv({ PROMPTFOO_BLOCK_PRIVATE_RANGES: undefined });

      const response = await api.post('/api/providers/discover').send(body);

      expect(response.status).toBe(200);
      expect(mockedLoadApiProvider).toHaveBeenCalled();
    });
  });
});
