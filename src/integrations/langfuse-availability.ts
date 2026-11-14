import { createRequire } from 'node:module';
import path from 'node:path';

import semverSatisfies from 'semver/functions/satisfies.js';
import { getDirectory } from '../esm';
import {
  isMissingPackageImportError,
  optionalPackageInstallHint,
} from '../util/packageImportErrors';
import { getPackageVersion } from '../util/packageVersion';

const installCommand = 'npm install promptfoo @langfuse/client@^5.11.1';

/** Validate the opt-in SDK before loading it for Langfuse prompt management. */
export async function loadLangfuseClient<T>(load: () => Promise<T>): Promise<T> {
  try {
    // Match the integration's module resolution, including Plug'n'Play hooks and
    // CommonJS NODE_PATH installations, instead of checking an unrelated cwd.
    const require = createRequire(path.join(getDirectory(), 'package.json'));
    const entryPoint = require.resolve('@langfuse/client');
    const version = getPackageVersion('@langfuse/client', entryPoint);
    if (!version || !semverSatisfies(version, '^5.11.1')) {
      throw new Error(
        `Langfuse prompt management requires @langfuse/client@^5.11.1 (found ${version ?? 'unknown'}). ${optionalPackageInstallHint(installCommand)}`,
      );
    }

    return await load();
  } catch (error) {
    if (isMissingPackageImportError(error, '@langfuse/client')) {
      throw new Error(
        `The @langfuse/client package is required for Langfuse prompt management. ${optionalPackageInstallHint(installCommand)}`,
      );
    }
    throw error;
  }
}
