import { describe, expect, it } from 'vitest';
import { validateTransformersDependency } from '../../src/providers/transformersAvailability';

describe('validateTransformersDependency', () => {
  // Dependency-injected checkers for deterministic tests
  // (following the pattern from sharpAvailability.test.ts)
  const transformersAvailable = async () => true;
  const transformersUnavailable = async () => false;

  describe('when transformers is available', () => {
    it('should not throw when dependency is available', async () => {
      await expect(validateTransformersDependency(transformersAvailable)).resolves.not.toThrow();
    });
  });

  describe('when transformers is unavailable', () => {
    it('should throw error with installation instructions', async () => {
      await expect(validateTransformersDependency(transformersUnavailable)).rejects.toThrow(
        '@huggingface/transformers is required for local embedding and text generation providers',
      );
      await expect(validateTransformersDependency(transformersUnavailable)).rejects.toThrow(
        'npm install @huggingface/transformers',
      );
    });
  });
});
