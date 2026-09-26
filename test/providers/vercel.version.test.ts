import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VercelAiEmbeddingProvider, VercelAiProvider } from '../../src/providers/vercel';

const { metadata, createGateway } = vi.hoisted(() => ({
  metadata: { version: '6.0.277' },
  createGateway: vi.fn(() => {
    throw new Error('installed SDK loaded');
  }),
}));

vi.mock('ai/package.json', () => ({ default: metadata }));
vi.mock('ai', () => ({ createGateway }));
vi.mock('../../src/cache', () => ({ getCache: vi.fn(), isCacheEnabled: () => false }));

beforeEach(() => {
  createGateway.mockReset();
});
afterEach(() => {
  metadata.version = '6.0.277';
});

describe('optional Vercel SDK compatibility', () => {
  it.each(['5.0.0', '6.0.263', '7.0.0', 'invalid'])(
    'rejects unsupported SDK %s when used',
    async (version) => {
      metadata.version = version;
      for (const config of [{}, { streaming: true }, { responseSchema: { type: 'object' } }]) {
        const provider = new VercelAiProvider('fixture/model', { config });
        const result = await provider.callApi('hello');
        expect(result.error).toContain(`installed ai package (${version}) is incompatible`);
        expect(result.error).toContain('npm install promptfoo "ai@^6.0.264"');
      }
      const embedding = await new VercelAiEmbeddingProvider('fixture/embedding').callEmbeddingApi(
        'hello',
      );
      expect(embedding.error).toContain(`installed ai package (${version}) is incompatible`);
      expect(createGateway).not.toHaveBeenCalled();
    },
  );

  it.each(['6.0.264', '6.0.277', '6.1.0'])('loads supported SDK %s', async (version) => {
    metadata.version = version;
    const result = await new VercelAiProvider('fixture/model').callApi('hello');
    expect(result.error).toContain('installed SDK loaded');
    expect(createGateway).toHaveBeenCalledOnce();
  });
});
