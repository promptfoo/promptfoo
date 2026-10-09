import path from 'path';

import cliState from '../cliState';
import { importModule } from '../esm';
import { isJavascriptFile } from '../util/fileExtensions';

interface FileTransformReference {
  filename: string;
  functionName?: string;
}

export function parseFileTransformReference(reference: string): FileTransformReference {
  const rawFilename = reference.startsWith('file://')
    ? reference.slice('file://'.length)
    : reference;
  const lastColonIndex = rawFilename.lastIndexOf(':');

  if (lastColonIndex === -1) {
    return { filename: rawFilename };
  }

  const candidateFilename = rawFilename.slice(0, lastColonIndex);
  const candidateFunctionName = rawFilename.slice(lastColonIndex + 1);
  if (candidateFilename && candidateFunctionName && isJavascriptFile(candidateFilename)) {
    return {
      filename: candidateFilename,
      functionName: candidateFunctionName,
    };
  }

  return { filename: rawFilename };
}

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
    const { filename, functionName } = parseFileTransformReference(transform);
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
