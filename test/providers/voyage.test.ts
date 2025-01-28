import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';

describe('Voyage Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with voyage', async () => {
      const provider = await loadApiProvider('voyage:voyage-2');
      expect(provider).toBeInstanceOf(VoyageEmbeddingProvider);
      expect(provider.id()).toBe('voyage:voyage-2');
    });
  });
});
