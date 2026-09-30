import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { AzureEmbeddingProvider } from '../../src/providers/azure/embedding';
import { getDefaultProviders } from '../../src/providers/defaults';
import { hasGoogleDefaultCredentials } from '../../src/providers/google/util';
import { hasCodexDefaultCredentials } from '../../src/providers/openai/codexDefaults';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { fetchWithRetries } from '../../src/util/fetch';
import { mockProcessEnv } from '../util/utils';

import type { EnvOverrides } from '../../src/types/env';

vi.mock('../../src/cache');
vi.mock('../../src/util/fetch', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithRetries: vi.fn(),
}));
vi.mock('../../src/providers/google/util', async (importOriginal) => ({
  ...(await importOriginal()),
  hasGoogleDefaultCredentials: vi.fn(),
}));
vi.mock('../../src/providers/openai/codexDefaults', async (importOriginal) => ({
  ...(await importOriginal()),
  hasCodexDefaultCredentials: vi.fn(),
}));

const data = {
  data: [{ embedding: [1, 2] }],
  embedding: { values: [1, 2] },
  usage: { total_tokens: 2 },
};
let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({}, { clear: true });
  vi.mocked(hasGoogleDefaultCredentials).mockResolvedValue(false);
  vi.mocked(hasCodexDefaultCredentials).mockReturnValue(false);
  vi.mocked(fetchWithCache).mockResolvedValue({
    data,
    cached: false,
    status: 200,
    statusText: 'OK',
    deleteFromCache: async () => {},
  });
  vi.mocked(fetchWithRetries).mockImplementation(async () => new Response(JSON.stringify(data)));
});
afterEach(async () => {
  restoreEnv();
  await providerRegistry.shutdownAll();
  vi.resetAllMocks();
});

describe('automatic embedding requests', () => {
  it.each([
    [
      'OPENAI_API_KEY',
      'OPENAI_API_BASE_URL',
      'openai:text-embedding-3-large',
      '/embeddings',
      'authorization',
    ],
    [
      'GEMINI_API_KEY',
      'GOOGLE_API_BASE_URL',
      'google:embedding:gemini-embedding-001',
      '/v1beta/models/gemini-embedding-001:embedContent',
      'x-goog-api-key',
    ],
    [
      'MISTRAL_API_KEY',
      'MISTRAL_API_BASE_URL',
      'mistral:embedding:mistral-embed',
      '/embeddings',
      'authorization',
    ],
    ['VOYAGE_API_KEY', 'VOYAGE_API_BASE_URL', 'voyage:voyage-3.5', '/embeddings', 'authorization'],
    [
      'AZURE_OPENAI_API_KEY',
      'AZURE_OPENAI_API_BASE_URL',
      'azure:vectors',
      '/openai/deployments/vectors/embeddings',
      'api-key',
    ],
  ])(
    'uses scoped %s credentials and endpoint for %s',
    async (key, endpointKey, id, route, header) => {
      mockProcessEnv({ [key]: 'process-fixture-key', [endpointKey]: 'https://process.example' });
      const env = {
        [key]: 'scoped-fixture-key',
        [endpointKey]: 'https://scoped.example',
        AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: 'vectors',
      } as EnvOverrides;
      const providers = await getDefaultProviders(env);
      expect(providers.embeddingProvider.id()).toBe(id);
      const result = await providers.embeddingProvider.callEmbeddingApi!('benign fixture');
      expect(result.embedding).toEqual([1, 2]);
      expect(result.error).toBeUndefined();
      const call =
        vi.mocked(fetchWithCache).mock.calls[0] ?? vi.mocked(fetchWithRetries).mock.calls[0];
      expect(String(call[0])).toContain('https://scoped.example' + route);
      const headers = new Headers(call[1]?.headers);
      expect(headers.get(header)).toBe(
        header === 'authorization' ? 'Bearer scoped-fixture-key' : 'scoped-fixture-key',
      );
    },
  );

  it.each([
    ['VOYAGE_API_KEY', 'voyage:voyage-3.5'],
    ['MISTRAL_API_KEY', 'mistral:embedding:mistral-embed'],
    ['GEMINI_API_KEY', 'google:embedding:gemini-embedding-001'],
  ])('keeps Anthropic grading while selecting embeddings from %s', async (key, id) => {
    const providers = await getDefaultProviders({
      ANTHROPIC_API_KEY: 'fixture-grader',
      [key]: 'fixture-embedding',
    });
    expect(providers.gradingProvider.id()).toMatch(/^anthropic:/);
    expect(providers.embeddingProvider.id()).toBe(id);
    expect(hasGoogleDefaultCredentials).not.toHaveBeenCalled();
  });

  it('reports missing embedding credentials without making a request', async () => {
    const providers = await getDefaultProviders({ ANTHROPIC_API_KEY: 'fixture-grader' });
    const response = await providers.embeddingProvider.callEmbeddingApi!('fixture');
    expect(response.error).toContain('No embedding provider is configured');
    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it.each([
    ['OPENAI_API_KEY', { VOYAGE_API_KEY: 'fixture-voyage' }, 'voyage:voyage-3.5'],
    ['MISTRAL_API_KEY', { VOYAGE_API_KEY: 'fixture-voyage' }, 'voyage:voyage-3.5'],
    ['VOYAGE_API_KEY', {}, 'embedding:unconfigured'],
  ])('respects an explicitly cleared %s when selecting embeddings', async (key, fallback, id) => {
    mockProcessEnv({ [key]: 'ambient-fixture' });
    const providers = await getDefaultProviders({ ...fallback, [key]: '' });
    expect(providers.embeddingProvider.id()).toBe(id);
  });

  it.each(['AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_TENANT_ID'])(
    'skips Azure embeddings when scoped %s is cleared',
    async (key) => {
      mockProcessEnv({
        AZURE_CLIENT_ID: 'ambient-client',
        AZURE_CLIENT_SECRET: 'ambient-secret',
        AZURE_TENANT_ID: 'ambient-tenant',
      });
      const initialize = vi
        .spyOn(AzureEmbeddingProvider.prototype, 'initialize')
        .mockResolvedValue();
      try {
        const providers = await getDefaultProviders({
          ANTHROPIC_API_KEY: 'fixture-grader',
          MISTRAL_API_KEY: 'fixture-embedding',
          AZURE_OPENAI_EMBEDDING_DEPLOYMENT_NAME: 'vectors',
          [key]: '',
        });
        expect(providers.embeddingProvider.id()).toBe('mistral:embedding:mistral-embed');
        expect(initialize).not.toHaveBeenCalled();
      } finally {
        initialize.mockRestore();
      }
    },
  );
});
