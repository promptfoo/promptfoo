import { createRequire } from 'node:module';
import path from 'node:path';

import semverSatisfies from 'semver/functions/satisfies.js';
import { getDirectory } from '../esm';
import {
  isMissingPackageImportError,
  optionalPackageInstallHint,
} from '../util/packageImportErrors';
import { getPackageVersion } from '../util/packageVersion';

const installCommand = 'npm install promptfoo @slack/web-api@^8.1.1';

/** Check the SDK before importing the Slack provider's static SDK imports. */
export async function loadSlackProviderModule<T>(load: () => Promise<T>): Promise<T> {
  try {
    // Match the provider's module resolution, including Plug'n'Play hooks and
    // CommonJS NODE_PATH installations, instead of checking an unrelated cwd.
    const require = createRequire(path.join(getDirectory(), 'package.json'));
    const entryPoint = require.resolve('@slack/web-api');
    const version = getPackageVersion('@slack/web-api', entryPoint);
    if (!version || !semverSatisfies(version, '^8.1.1')) {
      throw new Error(
        `The Slack provider requires @slack/web-api@^8.1.1 (found ${version ?? 'unknown'}). ${optionalPackageInstallHint(installCommand)}`,
      );
    }

    return await load();
  } catch (error) {
    if (isMissingPackageImportError(error, '@slack/web-api')) {
      throw new Error(
        `The @slack/web-api package is required for the Slack provider. ${optionalPackageInstallHint(installCommand)}`,
      );
    }
    throw error;
  }
}
