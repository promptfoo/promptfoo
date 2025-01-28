import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../../src/providers/replicate';

describe('Replicate Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with replicate:modelname', async () => {
      const provider = await loadApiProvider('replicate:meta/llama3');
      expect(provider).toBeInstanceOf(ReplicateProvider);
      expect(provider.id()).toBe('replicate:meta/llama3');
    });

    it('loadApiProvider with replicate:modelname:version', async () => {
      const provider = await loadApiProvider('replicate:meta/llama3:abc123');
      expect(provider).toBeInstanceOf(ReplicateProvider);
      expect(provider.id()).toBe('replicate:meta/llama3:abc123');
    });

    it('loadApiProvider with replicate:image', async () => {
      const provider = await loadApiProvider('replicate:image:stability-ai/sdxl');
      expect(provider).toBeInstanceOf(ReplicateImageProvider);
      expect(provider.id()).toBe('replicate:stability-ai/sdxl');
    });

    it('loadApiProvider with replicate:image:version', async () => {
      const provider = await loadApiProvider('replicate:image:stability-ai/sdxl:abc123');
      expect(provider).toBeInstanceOf(ReplicateImageProvider);
      expect(provider.id()).toBe('replicate:stability-ai/sdxl:abc123');
    });

    it('loadApiProvider with replicate:moderation', async () => {
      const provider = await loadApiProvider('replicate:moderation:foo/bar');
      expect(provider).toBeInstanceOf(ReplicateModerationProvider);
      expect(provider.id()).toBe('replicate:foo/bar');
    });

    it('loadApiProvider with replicate:moderation:version', async () => {
      const provider = await loadApiProvider('replicate:moderation:foo/bar:abc123');
      expect(provider).toBeInstanceOf(ReplicateModerationProvider);
      expect(provider.id()).toBe('replicate:foo/bar:abc123');
    });
  });
});
