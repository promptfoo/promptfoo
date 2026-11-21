import fs from 'fs';
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

// Matches the leading slash + Windows drive prefix from canonical `file:///C:/...`
// URLs (e.g. `/C:/` or `/C:\`). Only stripped on Windows so POSIX paths that
// legitimately start with `/X:` (a directory literally named `X:`) are preserved.
const WIN32_DRIVE_PREFIX = /^\/[A-Za-z]:[\\/]/;

function normalizeFilePath(filePath: string): string {
  if (process.platform === 'win32' && WIN32_DRIVE_PREFIX.test(filePath)) {
    return filePath.slice(1);
  }
  return filePath;
}

/**
 * Extracts the file path and optional function name from a `file://` URL.
 *
 * Splits at the **last** `:` rather than the first so Windows drive-letter
 * prefixes (`C:`, `D:`, ...) are preserved in `filePath`. The `lastColonIndex
 * > 1` guard prevents splitting at a leading drive-letter colon (`file://C:`
 * with no function name) or at the empty-path edge case (`file://:fn`). Only
 * JavaScript and Python callback files support the named-export suffix, so
 * colons in other valid POSIX paths remain part of the path.
 *
 * Examples:
 *   `file://callbacks.js`             → `{ filePath: 'callbacks.js' }`
 *   `file://callbacks.js:fn`          → `{ filePath: 'callbacks.js', functionName: 'fn' }`
 *   `file://C:/cb.js:fn`              → `{ filePath: 'C:/cb.js', functionName: 'fn' }`
 *   `file://C:`                       → `{ filePath: 'C:' }` (drive-letter colon preserved)
 *   `file://2026-05-27T12:00:00.js`   → `{ filePath: '2026-05-27T12:00:00.js' }` (colon is part of path)
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

/**
 * Build a wrapped Error that preserves the original error via the `cause`
 * property. We assign `cause` manually rather than using the ES2022
 * `new Error(msg, { cause })` form so the code typechecks under tsconfigs
 * that target ES2020 (e.g. `src/app/tsconfig.app.json`). Runtimes that
 * understand `Error.cause` (Node 18+, modern browsers) will display the
 * cause chain and `getCause(err)` helpers can traverse it.
 */
export function wrapError(message: string, cause: unknown): Error {
  const err = new Error(message);
  (err as Error & { cause?: unknown }).cause = cause;
  return err;
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

function isCallbackPathGuardDisabled(): boolean {
  const value = process.env.PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD;
  return (
    value !== undefined && ['1', 'true', 'yes', 'yup', 'yeppers'].includes(value.toLowerCase())
  );
}

/**
 * Resolves a file path against the active basePath and asserts it stays inside
 * that base directory.
 *
 * **Security**: this is the path-traversal guard for callback file references.
 *
 * Performs two checks:
 *   1. Lexical: rejects `..` traversal and Windows cross-drive paths.
 *   2. Symlink-aware (best-effort): when the file exists, resolves both
 *      basePath and the target with `fs.realpathSync.native` and re-checks
 *      containment. This catches the case where the resolved path lexically
 *      lives under basePath but is actually a symlink pointing outside.
 *
 * When the target file does not yet exist, the symlink check is skipped — the
 * downstream `importModule` call will fail naturally with `ENOENT` and the
 * lexical guard remains in force.
 *
 * Opt-out: setting `PROMPTFOO_DISABLE_CALLBACK_PATH_GUARD=true` disables both
 * checks for backward compatibility with configs that load callbacks from
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

  if (isCallbackPathGuardDisabled()) {
    return resolvedPath;
  }

  // Check 1 — lexical: cheap, runs even for non-existent files.
  assertWithinBase(filePath, resolvedPath, normalizedBase);

  // Check 2 — symlink-aware: if the file (and base) exist on disk, resolve
  // them to their real paths and re-run the containment check. Skip silently
  // when realpath itself fails (ENOENT, EACCES, etc.) — the downstream
  // import will surface the actual filesystem error, and the lexical check
  // above is already protective.
  let realBase: string | undefined;
  let realTarget: string | undefined;
  try {
    realBase = fs.realpathSync.native(normalizedBase);
    realTarget = fs.realpathSync.native(resolvedPath);
  } catch {
    // realpath couldn't resolve — fall through with the lexical result.
  }
  if (realBase !== undefined && realTarget !== undefined) {
    // Re-run the containment check on the resolved real paths. A
    // CallbackPathTraversalError thrown here MUST propagate.
    assertWithinBase(filePath, realTarget, realBase);
  }

  return resolvedPath;
}

/** Lexical containment check shared between the direct and realpath passes. */
function assertWithinBase(filePath: string, resolvedPath: string, normalizedBase: string): void {
  const relativePath = path.relative(normalizedBase, resolvedPath);

  // Reject paths that escape the base directory:
  // - relativePath is exactly '..' (the parent directory itself), OR
  // - the first path segment is '..' (e.g. '../escape.js', '..\..\evil')
  //   — but NOT a directory whose *name* happens to start with '..'
  //   (e.g. '..foo/cb.js' is a legitimate in-base path).
  // - an absolute relativePath is a Windows cross-drive case (e.g. base on
  //   `C:`, target on `D:`); path.relative then returns the absolute target.
  const escapesViaDotDot =
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    // path.relative may emit forward slashes on Windows; check posix sep too.
    relativePath.startsWith('../');
  if (escapesViaDotDot || path.isAbsolute(relativePath)) {
    throw new CallbackPathTraversalError(filePath, normalizedBase);
  }
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
 * Callers typically use {@link wrapError} to add provider-specific context
 * while preserving the original stack and `CallbackPathTraversalError`
 * instance for upstream classification.
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
