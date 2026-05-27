import path from 'path';

import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { runPython } from '../../python/pythonUtils';
import { isJavascriptFile, JAVASCRIPT_EXTENSIONS } from '../fileExtensions';

export const functionCache: Record<string, Function> = {};
const CALLABLE_FILE_EXTENSION_PATTERN = new RegExp(
  `(?:${[...JAVASCRIPT_EXTENSIONS, '.py', '.rb']
    .map((extension) => extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')}):`,
  'i',
);

interface LoadFunctionOptions {
  filePath: string;
  functionName?: string;
  defaultFunctionName?: string;
  basePath?: string;
  useCache?: boolean;
}

/**
 * Loads a function from a JavaScript or Python file
 * @param options Options for loading the function
 * @returns The loaded function
 */
export async function loadFunction<T extends Function>({
  filePath,
  functionName,
  defaultFunctionName = 'func',
  basePath = cliState.basePath,
  useCache = true,
}: LoadFunctionOptions): Promise<T> {
  const resolvedPath = basePath ? path.resolve(basePath, filePath) : filePath;
  const cacheKey = `${resolvedPath}:${
    functionName ? `named:${functionName}` : `default:${defaultFunctionName}`
  }`;

  if (useCache && functionCache[cacheKey]) {
    return functionCache[cacheKey] as T;
  }

  if (!isJavascriptFile(resolvedPath) && !resolvedPath.endsWith('.py')) {
    throw new Error(
      `File must be a JavaScript (${JAVASCRIPT_EXTENSIONS.join(', ')}) or Python (.py) file`,
    );
  }

  try {
    let func: T;
    if (isJavascriptFile(resolvedPath)) {
      const module = await importModule(resolvedPath, functionName);
      let moduleFunc: any;

      if (functionName) {
        moduleFunc = module;
      } else {
        moduleFunc =
          typeof module === 'function'
            ? module
            : module?.default?.default ||
              module?.default ||
              module?.[defaultFunctionName] ||
              module;
      }

      if (typeof moduleFunc !== 'function') {
        throw new Error(
          functionName
            ? `JavaScript file must export a "${functionName}" function`
            : `JavaScript file must export a function (as default export or named export "${defaultFunctionName}")`,
        );
      }
      func = moduleFunc as T;
    } else {
      const result = (...args: any[]) =>
        runPython(resolvedPath, functionName || defaultFunctionName, args);
      func = result as unknown as T;
    }

    if (useCache) {
      functionCache[cacheKey] = func;
    }

    return func;
  } catch (err) {
    logger.error(`Failed to load function: ${(err as Error).message}`);
    throw err;
  }
}

/**
 * Extracts the file path and function name from a file:// URL
 * @param fileUrl The file:// URL (e.g., "file://path/to/file.js:functionName")
 * @returns The file path and optional function name
 */
export function parseFileUrl(fileUrl: string): { filePath: string; functionName?: string } {
  if (!fileUrl.startsWith('file://')) {
    throw new Error('URL must start with file://');
  }

  const urlWithoutProtocol = fileUrl.slice('file://'.length);
  const functionSeparator = CALLABLE_FILE_EXTENSION_PATTERN.exec(urlWithoutProtocol);

  if (functionSeparator?.index !== undefined) {
    const separatorIndex = functionSeparator.index + functionSeparator[0].length - 1;
    return {
      filePath: urlWithoutProtocol.slice(0, separatorIndex),
      functionName: urlWithoutProtocol.slice(separatorIndex + 1),
    };
  }

  return {
    filePath: urlWithoutProtocol,
  };
}
