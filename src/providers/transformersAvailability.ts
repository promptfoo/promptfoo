import { createRequire } from 'node:module';

import semverSatisfies from 'semver/functions/satisfies.js';
import { isMissingPackageImportError } from '../util/packageImportErrors';
import { getPackageVersion } from '../util/packageVersion';

/** Load the optional SDK only after checking its runtime compatibility. */
export async function loadTransformers(): Promise<typeof import('@huggingface/transformers')> {
  try {
    const entryPoint = createRequire(import.meta.url).resolve('@huggingface/transformers');
    const version = getPackageVersion('@huggingface/transformers', entryPoint);
    if (!version || !semverSatisfies(version, '^4.0.0')) {
      throw new Error(
        `Local Transformers providers require @huggingface/transformers@^4.0.0 (found ${version ?? 'unknown'}). Install it with: npm install promptfoo @huggingface/transformers@^4.0.0`,
      );
    }
    return await import('@huggingface/transformers');
  } catch (error) {
    if (isMissingPackageImportError(error, '@huggingface/transformers')) {
      throw new Error(
        'Transformers.js is not installed. Install it with: npm install promptfoo @huggingface/transformers@^4.0.0',
      );
    }
    throw error;
  }
}
