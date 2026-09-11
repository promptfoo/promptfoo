import { afterEach, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { CloudflareGatewayOpenAiProvider } from '../../src/providers/cloudflare-gateway';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

it.each([
  'openai',
  'groq',
  'mistral',
])('uses the documented %s native gateway chat path', async (underlyingProvider) => {
  vi.mocked(fetchWithCache).mockClear();
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: { choices: [{ message: { content: 'Hello' }, finish_reason: 'stop' }] },
    status: 200,
    statusText: 'OK',
    cached: false,
  });
  const provider = new CloudflareGatewayOpenAiProvider(underlyingProvider, 'served-model:tag', {
    config: { accountId: 'fixture-account', gatewayId: 'fixture-gateway', apiKey: 'fixture-key' },
  });
  const result = await provider.callApi('Hello');
  expect(result.output).toBe('Hello');
  const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
  const suffix = underlyingProvider === 'mistral' ? 'mistral/v1' : underlyingProvider;
  expect(url).toBe(
    `https://gateway.ai.cloudflare.com/v1/fixture-account/fixture-gateway/${suffix}/chat/completions`,
  );
  expect(JSON.parse(request?.body as string).model).toBe('served-model:tag');
  expect(request?.headers).toMatchObject({ Authorization: 'Bearer fixture-key' });
});

it('returns the upstream failure for the corrected Mistral route', async () => {
  vi.mocked(fetchWithCache).mockRejectedValue(new Error('Fixture upstream failure'));
  const provider = new CloudflareGatewayOpenAiProvider('mistral', 'served-model:tag', {
    config: { accountId: 'fixture-account', gatewayId: 'fixture-gateway', apiKey: 'fixture-key' },
    id: 'custom-gateway-id',
  });
  const result = await provider.callApi('Hello');
  expect(provider.id()).toBe('custom-gateway-id');
  expect(result.error).toContain('Fixture upstream failure');
  expect(vi.mocked(fetchWithCache).mock.calls[0][0]).toBe(
    'https://gateway.ai.cloudflare.com/v1/fixture-account/fixture-gateway/mistral/v1/chat/completions',
  );
});
