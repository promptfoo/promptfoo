import path from 'path';

import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { runPython } from '../../python/pythonUtils';
import { isJavascriptFile, JAVASCRIPT_EXTENSIONS } from '../fileExtensions';

export const functionCache: Record<string, Function> = {};

const FILE_URL_FUNCTION_EXTENSIONS = [...JAVASCRIPT_EXTENSIONS, '.py', '.rb'];
const FUNCTION_REFERENCE_PATTERN =
  /^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|::)[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const RUBY_FUNCTION_REFERENCE_PATTERN =
  /^[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|::)[A-Za-z_$][A-Za-z0-9_$]*)*[!?]?$/;

function isFunctionReference(candidate: string, extension: string): boolean {
  return (extension === '.rb' ? RUBY_FUNCTION_REFERENCE_PATTERN : FUNCTION_REFERENCE_PATTERN).test(
    candidate,
  );
}

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
 * Extracts the file path and function name from a file:// URL.
 * Convention: file://path/to/file.ext:functionName
 *
 * The function name suffix is only recognized when:
 * - The colon is not at index 1 (to skip Windows drive letters like C:)
 * - The part after the colon is a valid function reference (identifier or dotted path)
 * - Ruby references may additionally end with `?` or `!`
 *
 * This means paths containing colons (e.g., file:///tmp/assert:one.js) are
 * treated as literal filenames when the suffix doesn't look like an identifier.
 *
 * @param fileUrl The file:// URL (e.g., "file://path/to/file.js:functionName")
 * @returns The file path and optional function name
 */
export function parseFileUrl(fileUrl: string): { filePath: string; functionName?: string } {
  if (!fileUrl.startsWith('file://')) {
    throw new Error('URL must start with file://');
  }

  const urlWithoutProtocol = fileUrl.slice('file://'.length);
  const colonIndexes = [...urlWithoutProtocol.matchAll(/:/g)]
    .map((match) => match.index)
    .filter((index): index is number => index !== undefined && index > 1);

  for (const colonIndex of colonIndexes.reverse()) {
    const filePath = urlWithoutProtocol.slice(0, colonIndex);
    const candidateFn = urlWithoutProtocol.slice(colonIndex + 1);
    const extension = path.extname(filePath).toLowerCase();

    if (
      FILE_URL_FUNCTION_EXTENSIONS.includes(extension) &&
      isFunctionReference(candidateFn, extension)
    ) {
      return {
        filePath,
        functionName: candidateFn,
      };
    }
  }

  const lastColonIndex = urlWithoutProtocol.lastIndexOf(':');

  if (lastColonIndex > 1) {
    const candidateFn = urlWithoutProtocol.slice(lastColonIndex + 1);
    // Only treat as function name if it looks like an identifier or dotted
    // reference (e.g., "myFunc", "Class.method", "namespace.func",
    // "MyModule::Nested.method").
    // Rejects file extensions (.js, .py, etc.), path segments (/foo), and numbers.
    if (
      FUNCTION_REFERENCE_PATTERN.test(candidateFn) &&
      !/\.(js|cjs|mjs|ts|cts|mts|py|rb|json|yaml|yml)$/i.test(candidateFn)
    ) {
      return {
        filePath: urlWithoutProtocol.slice(0, lastColonIndex),
        functionName: candidateFn,
      };
    }
  }

  return {
    filePath: urlWithoutProtocol,
  };
}
