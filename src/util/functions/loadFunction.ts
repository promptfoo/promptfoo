import path from 'path';

import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { runPython } from '../../python/pythonUtils';
import { isJavascriptFile, JAVASCRIPT_EXTENSIONS } from '../fileExtensions';

export const functionCache: Record<string, Function> = {};

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
  const lastColonIndex = urlWithoutProtocol.lastIndexOf(':');

  if (lastColonIndex > 1) {
    return {
      filePath: urlWithoutProtocol.slice(0, lastColonIndex),
      functionName: urlWithoutProtocol.slice(lastColonIndex + 1),
    };
  }

  return {
    filePath: urlWithoutProtocol,
  };
}

/**
 * Resolves a file path against the active basePath and asserts it stays inside
 * that base directory. Throws if the resolved path escapes (path traversal).
 *
 * @param filePath The (untrusted) relative or absolute path to resolve.
 * @param basePath The trusted base directory. Defaults to cliState.basePath or cwd.
 * @returns The resolved absolute path.
 */
export function resolveCallbackPath(filePath: string, basePath?: string): string {
  const effectiveBase = basePath ?? cliState.basePath ?? process.cwd();
  const normalizedBase = path.resolve(effectiveBase);
  const resolvedPath = path.resolve(normalizedBase, filePath);
  const relativePath = path.relative(normalizedBase, resolvedPath);

  // Reject paths that escape the base directory:
  // - relative path starting with '..' walks up out of base
  // - an absolute relative path (Windows edge case) means a different drive/root
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(
      `Path traversal detected: '${filePath}' resolves outside the base directory. ` +
        `Resolved path '${resolvedPath}' is not within '${normalizedBase}'.`,
    );
  }

  return resolvedPath;
}

/**
 * Loads a callback function from a `file://path[:functionName]` reference.
 *
 * Used by provider tool / function-call callback loaders. Combines:
 *   1. parseFileUrl to extract the file path and optional named export
 *   2. resolveCallbackPath to apply path-traversal protection against basePath
 *   3. importModule to load the file
 *   4. extracting the named export, default export, or module-as-function
 *
 * @param fileRef The `file://` reference (e.g. `file://callbacks.js:handler`).
 * @param options.logPrefix Optional prefix for the debug log line.
 * @returns The loaded callback as a Function.
 * @throws If the path escapes basePath, the file cannot be imported, or the
 *         expected export is missing / not a function.
 */
export async function loadCallbackFromFileUrl(
  fileRef: string,
  options: { logPrefix?: string } = {},
): Promise<Function> {
  const { filePath, functionName } = parseFileUrl(fileRef);
  const resolvedPath = resolveCallbackPath(filePath);

  const prefix = options.logPrefix ? `${options.logPrefix} ` : '';
  logger.debug(
    `${prefix}Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
  );

  const requiredModule = await importModule(resolvedPath, functionName);

  if (typeof requiredModule === 'function') {
    return requiredModule;
  }

  if (
    requiredModule &&
    typeof requiredModule === 'object' &&
    functionName &&
    functionName in requiredModule
  ) {
    const fn = (requiredModule as Record<string, unknown>)[functionName];
    if (typeof fn === 'function') {
      return fn as Function;
    }
  }

  throw new Error(
    `Function callback malformed: ${filePath} must export ${
      functionName
        ? `a named function '${functionName}'`
        : 'a function or have a default export as a function'
    }`,
  );
}
