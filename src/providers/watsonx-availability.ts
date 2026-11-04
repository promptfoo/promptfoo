import { createRequire } from 'node:module';
import path from 'node:path';

import semverSatisfies from 'semver/functions/satisfies.js';
import { getDirectory } from '../esm';
import {
  isMissingPackageImportError,
  optionalPackageInstallHint,
} from '../util/packageImportErrors';
import { getPackageVersion } from '../util/packageVersion';

const supportedVersions = {
  '@ibm-cloud/watsonx-ai': '^1.7.16',
  'ibm-cloud-sdk-core': '^5.6.2',
} as const;
const installCommand =
  'npm install promptfoo @ibm-cloud/watsonx-ai@^1.7.16 ibm-cloud-sdk-core@^5.6.2';

/** Validate each opt-in dependency when WatsonX first needs to load it. */
export async function loadWatsonXDependency<T>(
  packageName: keyof typeof supportedVersions,
  load: () => Promise<T>,
): Promise<T> {
  try {
    // Match the provider's module resolution, including Plug'n'Play hooks and
    // CommonJS NODE_PATH installations, instead of checking an unrelated cwd.
    const require = createRequire(path.join(getDirectory(), 'package.json'));
    const entryPoint = require.resolve(packageName);
    const version = getPackageVersion(packageName, entryPoint);
    const supportedVersion = supportedVersions[packageName];
    if (!version || !semverSatisfies(version, supportedVersion)) {
      throw new Error(
        `The WatsonX provider requires ${packageName}@${supportedVersion} (found ${version ?? 'unknown'}). ${optionalPackageInstallHint(installCommand)}`,
      );
    }

    return await load();
  } catch (error) {
    if (isMissingPackageImportError(error, packageName)) {
      throw new Error(
        `The ${packageName} package is required for the WatsonX provider. ${optionalPackageInstallHint(installCommand)}`,
      );
    }
    throw error;
  }
}
