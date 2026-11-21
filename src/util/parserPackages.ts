import nodeModule from 'node:module';

import semverSatisfies from 'semver/functions/satisfies.js';
import { isMissingPackageImportError, optionalPackageInstallHint } from './packageImportErrors';
import { getPackageVersion } from './packageVersion';

const supported = {
  'pdf-parse': '^2.4.5',
  'node-sql-parser': '^5.4.0',
};

export async function importParser(name: keyof typeof supported): Promise<unknown> {
  const range = supported[name];
  const hint = optionalPackageInstallHint(`npm install promptfoo ${name}@${range}`);
  try {
    // Use the deployed CommonJS filename. Bundlers can replace import.meta.url
    // with the build machine's path even when the output has been moved.
    const from = typeof __filename === 'string' ? __filename : import.meta.url;
    const entry = nodeModule.createRequire(from).resolve(name);
    const version = getPackageVersion(name, entry);
    if (!version || !semverSatisfies(version, range)) {
      throw new Error(`${name} ${version ?? '(unknown version)'} is not supported. ${hint}`);
    }
    return await import(/* webpackIgnore: true */ name);
  } catch (error) {
    if (isMissingPackageImportError(error, name)) {
      throw new Error(`${name} is not installed. ${hint}`);
    }
    throw error;
  }
}
