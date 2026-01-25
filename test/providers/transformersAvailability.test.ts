import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isTransformersAvailable,
  resetTransformersAvailabilityCache,
  validateTransformersDependency,
} from '../../src/providers/transformersAvailability';

describe('transformersAvailability', () => {
  beforeEach(() => {
    resetTransformersAvailabilityCache();
  });

  describe('isTransformersAvailable', () => {
    it('should return true when @huggingface/transformers is available', async () => {
      vi.doMock('@huggingface/transformers', () => ({}));
      resetTransformersAvailabilityCache();

      const result = await isTransformersAvailable();
      expect(result).toBe(true);
    });

    it('should cache the result after first check', async () => {
      const result1 = await isTransformersAvailable();
      const result2 = await isTransformersAvailable();

      expect(result1).toBe(result2);
    });
  });

  describe('validateTransformersDependency', () => {
    it('should not throw when transformers is available', async () => {
      const checkAvailable = vi.fn().mockResolvedValue(true);

      await expect(validateTransformersDependency(checkAvailable)).resolves.not.toThrow();
      expect(checkAvailable).toHaveBeenCalledOnce();
    });

    it('should throw with installation instructions when transformers is unavailable', async () => {
      const checkUnavailable = vi.fn().mockResolvedValue(false);

      await expect(validateTransformersDependency(checkUnavailable)).rejects.toThrow(
        '@huggingface/transformers is required for local embedding and text generation providers',
      );
      await expect(validateTransformersDependency(checkUnavailable)).rejects.toThrow(
        'npm install @huggingface/transformers',
      );
    });
  });

  describe('resetTransformersAvailabilityCache', () => {
    it('should allow re-checking availability after reset', async () => {
      // First check
      const result1 = await isTransformersAvailable();

      // Reset cache
      resetTransformersAvailabilityCache();

      // Second check should re-evaluate
      const result2 = await isTransformersAvailable();

      // Both should succeed in test environment (module is mocked)
      expect(result1).toBe(result2);
    });
  });
});
