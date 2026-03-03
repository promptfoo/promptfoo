/**
 * Utility for checking @huggingface/transformers availability.
 *
 * This module provides lazy checking of the optional @huggingface/transformers dependency
 * with caching to avoid repeated import attempts.
 */

let transformersAvailableCache: boolean | null = null;

/**
 * Checks if the @huggingface/transformers library is available.
 * Result is cached after first call for efficiency.
 */
export async function isTransformersAvailable(): Promise<boolean> {
  if (transformersAvailableCache !== null) {
    return transformersAvailableCache;
  }
  try {
    await import('@huggingface/transformers');
    transformersAvailableCache = true;
  } catch {
    transformersAvailableCache = false;
  }
  return transformersAvailableCache;
}

/**
 * Validates that the @huggingface/transformers library is installed.
 * Throws an error with installation instructions if not available.
 *
 * Call this early (before pipeline creation) to fail fast with a helpful message.
 */
export async function validateTransformersDependency(
  checkTransformers: () => Promise<boolean> = isTransformersAvailable,
): Promise<void> {
  if (!(await checkTransformers())) {
    throw new Error(
      '@huggingface/transformers is required for local embedding and text generation providers.\n' +
        'Install it with: npm install @huggingface/transformers',
    );
  }
}
