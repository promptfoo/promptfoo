import { createRequire } from 'node:module';
import path from 'node:path';

import semverSatisfies from 'semver/functions/satisfies.js';
import { getDirectory } from '../../esm';
import {
  isMissingPackageImportError,
  optionalPackageInstallHint,
} from '../../util/packageImportErrors';
import { getPackageVersion } from '../../util/packageVersion';

const installCommand = 'npm install promptfoo @openai/agents@^0.14.1';

/** Check Promptfoo's SDK before loading either the provider or its redteam tool loader. */
export async function loadOpenAiAgentsModule<T>(load: () => Promise<T>): Promise<T> {
  try {
    // Use Node's loader so Plug'n'Play hooks and CommonJS NODE_PATH installations
    // resolve the same SDK that the provider imports, relative to Promptfoo.
    const require = createRequire(path.join(getDirectory(), 'package.json'));
    const entryPoint = require.resolve('@openai/agents');
    const version = getPackageVersion('@openai/agents', entryPoint);
    if (!version || !semverSatisfies(version, '^0.14.1')) {
      throw new Error(
        `OpenAI Agents providers require @openai/agents@^0.14.1 (found ${version ?? 'unknown'}). ${optionalPackageInstallHint(installCommand)}`,
      );
    }

    return await load();
  } catch (error) {
    if (isMissingPackageImportError(error, '@openai/agents')) {
      throw new Error(
        `The @openai/agents package is required for OpenAI Agents providers. ${optionalPackageInstallHint(installCommand)}`,
      );
    }
    throw error;
  }
}
