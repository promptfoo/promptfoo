import { createRequire } from 'node:module';

import semverSatisfies from 'semver/functions/satisfies.js';
import {
  isMissingPackageImportError,
  optionalPackageInstallHint,
} from '../util/packageImportErrors';
import { getPackageVersion } from '../util/packageVersion';

const installCommand = 'npm install promptfoo @huggingface/transformers@^4.0.0';

/** Load the optional SDK only after checking its runtime compatibility. */
export async function loadTransformers(): Promise<typeof import('@huggingface/transformers')> {
  try {
    const entryPoint = createRequire(import.meta.url).resolve('@huggingface/transformers');
    const version = getPackageVersion('@huggingface/transformers', entryPoint);
    if (!version || !semverSatisfies(version, '^4.0.0')) {
      throw new Error(
        `Local Transformers providers require @huggingface/transformers@^4.0.0 (found ${version ?? 'unknown'}). ${optionalPackageInstallHint(installCommand)}`,
      );
    }
    return await import('@huggingface/transformers');
  } catch (error) {
    if (isMissingPackageImportError(error, '@huggingface/transformers')) {
      throw new Error(
        `Transformers.js is not installed. ${optionalPackageInstallHint(installCommand)}`,
      );
    }
    throw error;
  }
}
