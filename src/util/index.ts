import * as fs from 'fs';
import * as path from 'path';

import deepEqual from 'fast-deep-equal';
import { globSync, hasMagic } from 'glob';
import cliState from '../cliState';
import { TERMINAL_MAX_WIDTH } from '../constants';
import { getEnvBool, getEnvString } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import {
  type EvaluateResult,
  isApiProvider,
  isProviderOptions,
  type NunjucksFilterMap,
  type OutputFile,
  type TestCase,
} from '../types/index';
import invariant from '../util/invariant';
import { maybeLoadFromExternalFile } from './file';
import { isJavascriptFile } from './fileExtensions';
import { parseFileUrl } from './functions/loadFunction';
import { safeResolve } from './pathUtils';

import type { Vars } from '../types/index';

// Re-export from specialized modules for backwards compatibility
export { createOutputMetadata, writeOutput, writeMultipleOutputs } from './output';
export { setupEnv } from './env';
export { renderEnvOnlyInObject, renderVarsInObject } from './render';

// Import renderVarsInObject for internal use (used by maybeLoadToolsFromExternalFile)
import { renderVarsInObject } from './render';

export async function readOutput(outputPath: string): Promise<OutputFile> {
  const ext = path.parse(outputPath).ext.slice(1);

  switch (ext) {
    case 'json':
      return JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as OutputFile;
    default:
      throw new Error(`Unsupported output file format: ${ext} currently only supports json`);
  }
}

export async function readFilters(
  filters: Record<string, string>,
  basePath: string = '',
): Promise<NunjucksFilterMap> {
  const ret: NunjucksFilterMap = {};
  for (const [name, filterPath] of Object.entries(filters)) {
    const globPath = path.join(basePath, filterPath);
    const filePaths = globSync(globPath, {
      windowsPathsNoEscape: true,
    });
    for (const filePath of filePaths) {
      const finalPath = path.resolve(filePath);
      ret[name] = await importModule(finalPath);
    }
  }
  return ret;
}

export function printBorder() {
  const border = '='.repeat(TERMINAL_MAX_WIDTH);
  logger.info(border);
}

function canonicalizeProviderId(id: string): string {
  // Handle file:// prefix
  if (id.startsWith('file://')) {
    const filePath = id.slice('file://'.length);
    return path.isAbsolute(filePath) ? id : `file://${path.resolve(filePath)}`;
  }

  // Handle other executable prefixes with file paths
  const executablePrefixes = ['exec:', 'python:', 'golang:'];
  for (const prefix of executablePrefixes) {
    if (id.startsWith(prefix)) {
      const filePath = id.slice(prefix.length);
      if (filePath.includes('/') || filePath.includes('\\')) {
        return `${prefix}${path.resolve(filePath)}`;
      }
      return id;
    }
  }

  // For JavaScript/TypeScript files without file:// prefix
  if (
    (id.endsWith('.js') || id.endsWith('.ts') || id.endsWith('.mjs')) &&
    (id.includes('/') || id.includes('\\'))
  ) {
    return `file://${path.resolve(id)}`;
  }

  return id;
}

function getProviderLabel(provider: any): string | undefined {
  return provider?.label && typeof provider.label === 'string' ? provider.label : undefined;
}

export function providerToIdentifier(
  provider: TestCase['provider'] | { id?: string; label?: string } | undefined,
): string | undefined {
  if (!provider) {
    return undefined;
  }

  if (typeof provider === 'string') {
    return canonicalizeProviderId(provider);
  }

  // Check for label first on any provider type
  const label = getProviderLabel(provider);
  if (label) {
    return label;
  }

  if (isApiProvider(provider)) {
    return canonicalizeProviderId(provider.id());
  }

  if (isProviderOptions(provider)) {
    if (provider.id) {
      return canonicalizeProviderId(provider.id);
    }
    return undefined;
  }

  // Handle any other object with id property
  if (typeof provider === 'object' && 'id' in provider && typeof provider.id === 'string') {
    return canonicalizeProviderId(provider.id);
  }

  return undefined;
}

/**
 * Runtime variables that are added during evaluation but aren't part
 * of the original test definition. These should be filtered when
 * comparing test cases for matching purposes.
 *
 * - _conversation: Added by the evaluator for multi-turn conversations
 * - sessionId: Added by multi-turn strategy providers (GOAT, Crescendo, SIMBA)
 */
const RUNTIME_VAR_KEYS = ['_conversation', 'sessionId'] as const;

/**
 * Filters out runtime-only variables that are added during evaluation
 * but aren't part of the original test definition.
 *
 * This is used when comparing test cases to determine if a result
 * corresponds to a particular test, regardless of runtime state.
 */
export function filterRuntimeVars(vars: Vars | undefined): Vars | undefined {
  if (!vars) {
    return vars;
  }
  const filtered = { ...vars };
  for (const key of RUNTIME_VAR_KEYS) {
    delete filtered[key];
  }
  return filtered;
}

export function varsMatch(vars1: Vars | undefined, vars2: Vars | undefined) {
  return deepEqual(vars1, vars2);
}

export function resultIsForTestCase(result: EvaluateResult, testCase: TestCase): boolean {
  const providersMatch = testCase.provider
    ? providerToIdentifier(testCase.provider) === providerToIdentifier(result.provider)
    : true;

  // Filter out runtime variables like _conversation and sessionId when matching.
  // These are added by multi-turn providers during evaluation but shouldn't affect test matching.
  const resultVars = filterRuntimeVars(result.vars);
  const testVars = filterRuntimeVars(testCase.vars);
  return varsMatch(testVars, resultVars) && providersMatch;
}

/**
 * Parses a file path or glob pattern to extract function names and file extensions.
 * Function names can be specified in the filename like this:
 * prompt.py:myFunction or prompts.js:myFunction.
 * @param basePath - The base path for file resolution.
 * @param promptPath - The path or glob pattern.
 * @returns Parsed details including function name, file extension, and directory status.
 */
export function parsePathOrGlob(
  basePath: string,
  promptPath: string,
): {
  extension?: string;
  functionName?: string;
  isPathPattern: boolean;
  filePath: string;
} {
  if (promptPath.startsWith('file://')) {
    promptPath = promptPath.slice('file://'.length);
  }
  const filePath = path.resolve(basePath, promptPath);

  let filename = path.relative(basePath, filePath);
  let functionName: string | undefined;

  if (filename.includes(':')) {
    // Windows-aware path parsing: check if colon is part of drive letter
    const lastColonIndex = filename.lastIndexOf(':');
    if (lastColonIndex > 1) {
      const pathWithoutFunction = filename.slice(0, lastColonIndex);
      if (
        isJavascriptFile(pathWithoutFunction) ||
        pathWithoutFunction.endsWith('.py') ||
        pathWithoutFunction.endsWith('.go') ||
        pathWithoutFunction.endsWith('.rb')
      ) {
        functionName = filename.slice(lastColonIndex + 1);
        filename = pathWithoutFunction;
      }
    }
  }

  // verify that filename without function exists
  let stats;
  try {
    stats = fs.statSync(path.join(basePath, filename));
  } catch (err) {
    if (getEnvBool('PROMPTFOO_STRICT_FILES')) {
      throw err;
    }
  }

  // Check for glob patterns in the original path or the resolved path
  // On Windows, normalize separators for cross-platform glob pattern detection
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const isPathPattern =
    stats?.isDirectory() || hasMagic(promptPath) || hasMagic(normalizedFilePath);
  const safeFilename = path.relative(basePath, safeResolve(basePath, filename));
  return {
    extension: isPathPattern ? undefined : path.parse(safeFilename).ext,
    filePath: safeFilename.startsWith(basePath) ? safeFilename : path.join(basePath, safeFilename),
    functionName,
    isPathPattern,
  };
}

export function isRunningUnderNpx(): boolean {
  const npmExecPath = getEnvString('npm_execpath');
  const npmLifecycleScript = getEnvString('npm_lifecycle_script');

  return Boolean(
    (npmExecPath && npmExecPath.includes('npx')) ||
      process.execPath.includes('npx') ||
      (npmLifecycleScript && npmLifecycleScript.includes('npx')),
  );
}

/**
 * Renders variables in a tools object and loads from external file if applicable.
 * This function combines renderVarsInObject and maybeLoadFromExternalFile into a single step
 * specifically for handling tools configurations.
 *
 * Supports loading from JSON, YAML, Python, and JavaScript files.
 *
 * @param tools - The tools configuration object or array to process.
 * @param vars - Variables to use for rendering.
 * @returns The processed tools configuration with variables rendered and content loaded from files if needed.
 * @throws {Error} If the loaded tools are in an invalid format
 */
export async function maybeLoadToolsFromExternalFile(
  tools: any,
  vars?: Record<string, string | object>,
): Promise<any> {
  const rendered = renderVarsInObject(tools, vars);

  // Check if this is a Python/JS file reference with function name
  // These need special handling to execute the function and get the result
  if (typeof rendered === 'string' && rendered.startsWith('file://')) {
    const { filePath, functionName } = parseFileUrl(rendered);

    if (functionName && (filePath.endsWith('.py') || isJavascriptFile(filePath))) {
      // Execute the function to get tool definitions
      const fileType = filePath.endsWith('.py') ? 'Python' : 'JavaScript';
      logger.debug(
        `[maybeLoadToolsFromExternalFile] Loading tools from ${fileType} file: ${filePath}:${functionName}`,
      );

      try {
        let toolDefinitions: any;

        if (filePath.endsWith('.py')) {
          // Resolve Python path relative to config base directory (same as JavaScript)
          const absPath = safeResolve(cliState.basePath || process.cwd(), filePath);
          logger.debug(`[maybeLoadToolsFromExternalFile] Resolved Python path: ${absPath}`);
          toolDefinitions = await runPython(absPath, functionName, []);
        } else {
          // Use safeResolve for security (prevents path traversal)
          const absPath = safeResolve(cliState.basePath || process.cwd(), filePath);
          logger.debug(`[maybeLoadToolsFromExternalFile] Resolved JavaScript path: ${absPath}`);

          const module = await importModule(absPath);
          const fn = module[functionName] || module.default?.[functionName];

          if (typeof fn !== 'function') {
            const availableExports = Object.keys(module).filter((k) => k !== 'default');
            const basePath = cliState.basePath || process.cwd();
            throw new Error(
              `Function "${functionName}" not found in ${filePath}. ` +
                `Available exports: ${availableExports.length > 0 ? availableExports.join(', ') : '(none)'}\n` +
                `Resolved from: ${basePath}`,
            );
          }

          // Call the function - handle both sync and async functions
          toolDefinitions = await Promise.resolve(fn());
        }

        // Validate the result - must be array or object, not primitive
        if (
          !toolDefinitions ||
          typeof toolDefinitions === 'string' ||
          typeof toolDefinitions === 'number' ||
          typeof toolDefinitions === 'boolean'
        ) {
          throw new Error(
            `Function "${functionName}" must return an array or object of tool definitions, ` +
              `but returned: ${toolDefinitions === null ? 'null' : typeof toolDefinitions}`,
          );
        }

        logger.debug(
          `[maybeLoadToolsFromExternalFile] Successfully loaded ${Array.isArray(toolDefinitions) ? toolDefinitions.length : 'object'} tools`,
        );
        return toolDefinitions;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const basePath = cliState.basePath || process.cwd();
        throw new Error(
          `Failed to load tools from ${rendered}:\n${errorMessage}\n\n` +
            `Make sure the function "${functionName}" exists and returns a valid tool definition array.\n` +
            `Resolved from: ${basePath}`,
        );
      }
    }

    // Python/JS file without function name - provide helpful error
    if (filePath.endsWith('.py') || isJavascriptFile(filePath)) {
      const ext = filePath.endsWith('.py') ? 'Python' : 'JavaScript';
      const basePath = cliState.basePath || process.cwd();
      throw new Error(
        `Cannot load tools from ${rendered}\n` +
          `${ext} files require a function name. Use this format:\n` +
          `  tools: file://${filePath}:get_tools\n\n` +
          `Your ${ext} file should export a function that returns tool definitions:\n` +
          (filePath.endsWith('.py')
            ? `  def get_tools():\n      return [{"type": "function", "function": {...}}]`
            : `  module.exports.get_tools = () => [{ type: "function", function: {...} }];`) +
          `\n\nResolved from: ${basePath}`,
      );
    }
  }

  // Handle arrays by recursively processing each item
  if (Array.isArray(rendered)) {
    const results = await Promise.all(
      rendered.map((item) => maybeLoadToolsFromExternalFile(item, vars)),
    );
    // Flatten if all items are arrays (common case: multiple file:// references)
    if (results.every((r) => Array.isArray(r))) {
      return results.flat();
    }
    return results;
  }

  // If tools is already an object (not a file reference), return it as-is
  if (typeof rendered !== 'string') {
    return rendered;
  }

  // Standard loading for JSON/YAML files
  const loaded = maybeLoadFromExternalFile(rendered);

  // Validate the loaded result - tools must be an array or object, not a string
  if (loaded !== undefined && loaded !== null && typeof loaded === 'string') {
    // Unresolved file:// reference
    if (loaded.startsWith('file://')) {
      throw new Error(
        `Failed to load tools from ${loaded}\n` +
          `Ensure the file exists and contains valid JSON or YAML tool definitions.`,
      );
    }

    // Raw file content loaded (e.g., Python code read as text without function name)
    if (loaded.includes('def ') || loaded.includes('import ')) {
      throw new Error(
        `Invalid tools configuration: file appears to contain Python code.\n` +
          `Python files require a function name. Use this format:\n` +
          `  tools: file://tools.py:get_tools`,
      );
    }

    // Some other invalid string content
    throw new Error(
      `Invalid tools configuration: expected an array or object, but got a string.\n` +
        `If using file://, ensure the file contains valid JSON or YAML tool definitions.`,
    );
  }

  return loaded;
}
