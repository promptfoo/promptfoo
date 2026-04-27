import path from 'path';

import cliState from '../cliState';
import { importModule } from '../esm';
import { isJavascriptFile } from '../util/fileExtensions';

/**
 * Loads a module from a file:// reference if needed.
 *
 * @param transform - The transform config (string or function)
 * @returns The loaded function, or the original value if not a file:// reference
 */
export async function loadTransformModule(
  transform: string | Function | undefined,
): Promise<string | Function | undefined> {
  if (!transform) {
    return transform;
  }
  if (typeof transform === 'function') {
    return transform;
  }
  if (typeof transform === 'string' && transform.startsWith('file://')) {
    let filename = transform.slice('file://'.length);
    let functionName: string | undefined;
    if (filename.includes(':')) {
      const splits = filename.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filename, functionName] = splits;
      }
    }
    const requiredModule = await importModule(
      path.resolve(cliState.basePath || '', filename),
      functionName,
    );
    if (typeof requiredModule === 'function') {
      return requiredModule;
    }
    throw new Error(
      `Transform module malformed: ${filename} must export a function or have a default export as a function`,
    );
  }
  return transform;
}
