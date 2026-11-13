import fs from 'node:fs';
import path from 'node:path';

/** Read metadata for the exact resolved module, including packages that hide package.json. */
export function getPackageVersion(packageName: string, resolvedEntryPoint: string): string | null {
  let directory = path.dirname(resolvedEntryPoint);
  while (true) {
    try {
      const manifest: { name?: unknown; version?: unknown } = JSON.parse(
        fs.readFileSync(path.join(directory, 'package.json'), 'utf8'),
      );
      if (manifest.name === packageName) {
        return typeof manifest.version === 'string' ? manifest.version : null;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}
