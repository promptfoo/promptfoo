import path from 'path';

import cliState from '../../cliState';
import { importModule } from '../../esm';
import logger from '../../logger';
import { runPython } from '../../python/pythonUtils';
import { isJavascriptFile, JAVASCRIPT_EXTENSIONS } from '../fileExtensions';

export const functionCache: Record<string, Function> = {};

export interface ScenarioConfigSourceContext {
  basePath: string;
  envOverrides?: Record<string, string | undefined>;
}

const scenarioConfigSourceContexts = new WeakMap<object, ScenarioConfigSourceContext>();
const scenarioSourceContexts = new WeakMap<object, ScenarioConfigSourceContext>();

export function getScenarioConfigSourceContext(
  valuesRef: object,
): ScenarioConfigSourceContext | undefined {
  return scenarioConfigSourceContexts.get(valuesRef);
}

export function setScenarioConfigSourceContext(
  valuesRef: object,
  sourceContext: ScenarioConfigSourceContext,
): void {
  scenarioConfigSourceContexts.set(valuesRef, sourceContext);
}

export function getScenarioSourceContext(
  scenario: object,
): ScenarioConfigSourceContext | undefined {
  return scenarioSourceContexts.get(scenario);
}

export function setScenarioSourceContext(
  scenario: object,
  sourceContext: ScenarioConfigSourceContext,
): void {
  scenarioSourceContexts.set(scenario, sourceContext);
}

export function transferScenarioSourceContext<T extends object>(source: object, target: T): T {
  const sourceContext = scenarioSourceContexts.get(source);
  if (sourceContext) {
    scenarioSourceContexts.set(target, sourceContext);
  }
  return target;
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

// Matches the leading slash + Windows drive prefix from canonical `file:///C:/...`
// URLs (e.g. `/C:/` or `/C:\`). Only stripped on Windows so POSIX paths that
// legitimately start with `/X:` (a directory literally named `X:`) are preserved.
const WIN32_DRIVE_PREFIX = /^\/[A-Za-z]:[\\/]/;

export function normalizeFilePath(filePath: string): string {
  if (process.platform === 'win32' && WIN32_DRIVE_PREFIX.test(filePath)) {
    return filePath.slice(1);
  }
  return filePath;
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
    const candidateFilePath = urlWithoutProtocol.slice(0, lastColonIndex);

    // Only executable function files support a :functionName suffix. This preserves
    // colons that are part of a valid file or directory name on POSIX systems.
    if (!isJavascriptFile(candidateFilePath) && !candidateFilePath.endsWith('.py')) {
      return {
        filePath: normalizeFilePath(urlWithoutProtocol),
      };
    }

    return {
      filePath: normalizeFilePath(candidateFilePath),
      functionName: urlWithoutProtocol.slice(lastColonIndex + 1),
    };
  }

  return {
    filePath: normalizeFilePath(urlWithoutProtocol),
  };
}
