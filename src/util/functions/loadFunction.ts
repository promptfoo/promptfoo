import path from 'path';

import cliState from '../../cliState';
import { getEnvBool } from '../../envars';
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
 * Extracts the file path and optional function name from a `file://` URL.
 *
 * Splits at the **last** `:` rather than the first so Windows drive-letter
 * prefixes (`C:`, `D:`, ...) are preserved in `filePath`. The `lastColonIndex
 * > 1` guard prevents splitting at a leading drive-letter colon (`file://C:`
 * with no function name) or at the empty-path edge case (`file://:fn`).
 *
 * Examples:
 *   `file://callbacks.js`          → `{ filePath: 'callbacks.js' }`
 *   `file://callbacks.js:fn`       → `{ filePath: 'callbacks.js', functionName: 'fn' }`
 *   `file://C:/cb.js:fn`           → `{ filePath: 'C:/cb.js', functionName: 'fn' }`
 *   `file://C:`                    → `{ filePath: 'C:' }` (drive-letter colon preserved)
 *
 * @param fileUrl The `file://` URL.
 * @returns The file path and optional function name.
 * @throws If `fileUrl` does not start with `file://`.
 */
export function parseFileUrl(fileUrl: string): { filePath: string; functionName?: string } {
  if (!fileUrl.startsWith('file://')) {
    throw new Error('URL must start with file://');
  }

  const urlWithoutProtocol = fileUrl.slice('file://'.length);
  const lastColonIndex = urlWithoutProtocol.lastIndexOf(':');

  // Index > 1 (not >= 1) preserves single-letter drive prefixes like `C:` so
  // Windows paths don't get sliced to `C`. Do not "simplify" to >= 0.
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
 * Error thrown when a callback `file://` reference resolves outside the active
 * base directory. Distinct class so callers can surface it differently from
 * other load errors (e.g. log at warn, surface to users) — a path-traversal
 * rejection is a security event, not a "module not found".
 */
export class CallbackPathTraversalError extends Error {
  readonly filePath: string;
  readonly basePath: string;

  constructor(filePath: string, basePath: string) {
    // Keep the message terse and non-leaking. The full resolved path is
    // available on the instance for debug logging if a caller wants it.
    super(
      `Path traversal rejected: '${filePath}' resolves outside the configured base directory. ` +
        `Place the callback file inside the base directory, or set ` +
        `PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD=true to opt out (NOT recommended).`,
    );
    this.name = 'CallbackPathTraversalError';
    this.filePath = filePath;
    this.basePath = basePath;
  }
}

/**
 * Resolves a file path against the active basePath and asserts it stays inside
 * that base directory.
 *
 * **Security**: this is the path-traversal guard for callback file references.
 * The check is **lexical**, not filesystem-resolved — a symlink inside basePath
 * that points outside is NOT detected. Callers that load untrusted symlinks
 * should add `fs.realpathSync` themselves.
 *
 * Opt-out: setting `PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD=true` disables the
 * guard for backward compatibility with configs that load callbacks from
 * outside basePath. Disabling it weakens the protection against malicious
 * callback file paths supplied via config.
 *
 * @param filePath The (untrusted) relative or absolute path to resolve.
 * @param basePath The trusted base directory. Defaults to `cliState.basePath`
 *   or `process.cwd()`.
 * @returns The resolved absolute path.
 * @throws {CallbackPathTraversalError} If the resolved path escapes basePath.
 */
export function resolveCallbackPath(filePath: string, basePath?: string): string {
  const effectiveBase = basePath ?? cliState.basePath ?? process.cwd();
  const normalizedBase = path.resolve(effectiveBase);
  const resolvedPath = path.resolve(normalizedBase, filePath);

  if (getEnvBool('PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD', false)) {
    return resolvedPath;
  }

  const relativePath = path.relative(normalizedBase, resolvedPath);

  // Reject paths that escape the base directory:
  // - relative path starting with '..' walks up out of base
  // - an absolute relative path is a Windows cross-drive case (e.g. base on
  //   `C:`, target on `D:`); path.relative then returns the absolute target.
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new CallbackPathTraversalError(filePath, normalizedBase);
  }

  return resolvedPath;
}

/**
 * Loads a callback function from a `file://path[:functionName]` reference.
 *
 * Used by provider tool / function-call callback loaders. Combines:
 *   1. {@link parseFileUrl} to extract the file path and optional named export
 *   2. {@link resolveCallbackPath} to apply path-traversal protection
 *   3. {@link importModule} to load the file
 *   4. extracting the named export, default export, or module-as-function
 *
 * Callers typically wrap the throw to add provider-specific context (e.g.
 * `Error loading function from <fileRef>: ...`) using `Error(msg, { cause })`
 * so the original stack and `CallbackPathTraversalError` instance are
 * preserved for upstream classification.
 *
 * @param fileRef The `file://` reference (e.g. `file://callbacks.js:handler`).
 * @param options.logPrefix Optional prefix for the debug log line (e.g.
 *   `[Bedrock Converse]`).
 * @param options.basePath Override for the base directory used by the
 *   traversal guard. Defaults to `cliState.basePath` (via
 *   {@link resolveCallbackPath}).
 * @param options.lenient When true, falls back to the module's default export
 *   (or the module itself if it is callable) if a named export is missing.
 *   Used only by {@link FunctionCallbackHandler} for backward compatibility.
 * @returns The loaded callback as a Function.
 * @throws {CallbackPathTraversalError} If the path escapes basePath.
 * @throws If the file cannot be imported, or the expected export is missing.
 */
export async function loadCallbackFromFileUrl(
  fileRef: string,
  options: { logPrefix?: string; basePath?: string; lenient?: boolean } = {},
): Promise<Function> {
  const { filePath, functionName } = parseFileUrl(fileRef);
  const resolvedPath = resolveCallbackPath(filePath, options.basePath);

  const prefix = options.logPrefix ? `${options.logPrefix} ` : '';
  logger.debug(
    `${prefix}Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
  );

  if (options.lenient) {
    // Lenient mode (used by FunctionCallbackHandler for backward compat):
    // call importModule without functionName so we can fall back to default
    // export — or the module itself if it's callable — when a named export
    // is missing. Prefer strict mode for new callsites.
    const mod = await importModule(resolvedPath);
    const candidate =
      (functionName && (mod as Record<string, unknown>)?.[functionName]) ||
      (mod as { default?: unknown })?.default ||
      mod;
    if (typeof candidate === 'function') {
      return candidate as Function;
    }
    throw new Error(
      `Function callback malformed: ${filePath} must export ${
        functionName
          ? `a named function '${functionName}' or a default export`
          : 'a function or have a default export as a function'
      }`,
    );
  }

  // Strict mode: importModule returns the named export directly when
  // functionName is set (or undefined if missing); otherwise it returns the
  // resolved module.
  const imported = await importModule(resolvedPath, functionName);

  if (typeof imported === 'function') {
    return imported;
  }

  // Defensive: if a caller's module structure causes importModule to return
  // the full module object even with a functionName request (e.g. transpiled
  // CJS shapes), allow looking up the named member.
  if (imported && typeof imported === 'object' && functionName && functionName in imported) {
    const fn = (imported as Record<string, unknown>)[functionName];
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
