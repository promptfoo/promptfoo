import * as fs from 'fs';
import { access } from 'fs/promises';
import * as path from 'path';

import { type Options as CsvOptions, parse as csvParse } from 'csv-parse/sync';
import { globSync, hasMagic } from 'glob';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import cliState from '../cliState';
import { getEnvBool } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import { isJavascriptFile } from './fileExtensions';
import { parseFileUrl } from './functions/loadFunction';
import { safeResolve } from './pathUtils';
import { renderVarsInObject } from './render';

import type { NunjucksFilterMap, OutputFile, VarValue } from '../types';

type CsvParseOptionsWithColumns<T> = Omit<CsvOptions<T>, 'columns'> & {
  columns: Exclude<CsvOptions['columns'], undefined | false>;
};

type FileLoadContext = 'assertion' | 'general' | 'vars';

type ExternalFileReference = {
  cleanPath: string;
  functionName?: string;
  renderedFilePath: string;
};

function isScriptFile(filePath: string): boolean {
  return filePath.endsWith('.py') || isJavascriptFile(filePath);
}

function parseExternalFileReference(filePath: string): ExternalFileReference {
  const renderedFilePath = getNunjucksEngineForFilePath().renderString(filePath, {});
  const { filePath: cleanPath, functionName } = parseFileUrl(renderedFilePath);

  return {
    cleanPath,
    functionName,
    renderedFilePath,
  };
}

function shouldPreserveExternalFileReference(
  reference: ExternalFileReference,
  context?: FileLoadContext,
): boolean {
  if (context === 'assertion' && isScriptFile(reference.cleanPath)) {
    logger.debug(
      `Preserving Python/JS file reference in assertion context: ${reference.renderedFilePath}`,
    );
    return true;
  }

  if (context === 'vars') {
    logger.debug(`Preserving file reference in vars context: ${reference.renderedFilePath}`);
    return true;
  }

  if (reference.functionName && isScriptFile(reference.cleanPath)) {
    return true;
  }

  return false;
}

function getExternalPathToUse(reference: ExternalFileReference): string {
  if (reference.functionName && !isScriptFile(reference.cleanPath)) {
    return reference.renderedFilePath.slice('file://'.length);
  }

  return reference.cleanPath;
}

function parseCsvContents(contents: string): Record<string, string>[] | string[] {
  const csvOptions: CsvParseOptionsWithColumns<Record<string, string>> = {
    columns: true as const,
  };
  const records = csvParse<Record<string, string>>(contents, csvOptions);

  if (records.length > 0 && Object.keys(records[0]).length === 1) {
    return records.map((record) => Object.values(record)[0]);
  }

  return records;
}

function parseFileContents(filePath: string, contents: string): any {
  if (filePath.endsWith('.json')) {
    try {
      return JSON.parse(contents);
    } catch (error) {
      throw new Error(`Failed to parse JSON file ${filePath}: ${error}`);
    }
  }

  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    try {
      return yaml.load(contents);
    } catch (error) {
      throw new Error(`Failed to parse YAML file ${filePath}: ${error}`);
    }
  }

  if (filePath.endsWith('.csv')) {
    return parseCsvContents(contents);
  }

  return contents;
}

function readExternalFile(filePath: string): any {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File does not exist: ${filePath}`);
    }
    throw new Error(`Failed to read file ${filePath}: ${error}`);
  }

  return parseFileContents(filePath, contents);
}

function appendLoadedFileContents(target: any[], filePath: string, loaded: any): void {
  if ((filePath.endsWith('.yaml') || filePath.endsWith('.yml')) && loaded === null) {
    return;
  }

  if (loaded === undefined) {
    return;
  }

  if (Array.isArray(loaded)) {
    target.push(...loaded);
    return;
  }

  target.push(loaded);
}

function loadGlobContents(resolvedPath: string): any[] {
  const matchedFiles = globSync(resolvedPath, {
    windowsPathsNoEscape: true,
  });

  if (matchedFiles.length === 0) {
    throw new Error(`No files found matching pattern: ${resolvedPath}`);
  }

  const allContents: any[] = [];
  for (const matchedFile of matchedFiles) {
    let contents: string;
    try {
      contents = fs.readFileSync(matchedFile, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug(`File disappeared during glob expansion: ${matchedFile}`);
        continue;
      }
      throw error;
    }

    appendLoadedFileContents(allContents, matchedFile, parseFileContents(matchedFile, contents));
  }

  return allContents;
}

/**
 * Returns true if the path is accessible. ENOENT (and ENOTDIR, which Node
 * surfaces when a path component isn't a directory) yield false; other errors
 * such as EACCES/EPERM are rethrown so permission problems remain visible.
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return false;
    }
    throw err;
  }
}

/**
 * Simple Nunjucks engine specifically for file paths
 * This function is separate from the main getNunjucksEngine to avoid circular dependencies
 */
export function getNunjucksEngineForFilePath(): nunjucks.Environment {
  const env = nunjucks.configure({
    autoescape: false,
  });

  // Add environment variables as template globals
  env.addGlobal('env', {
    ...process.env,
    ...cliState.config?.env,
  });

  return env;
}

/**
 * Loads content from an external file if the input is a file path, otherwise
 * returns the input as-is. Supports Nunjucks templating for file paths.
 *
 * @param filePath - The input to process. Can be a file path string starting with "file://",
 * an array of file paths, or any other type of data.
 * @param context - Optional context to control file loading behavior. 'assertion' context
 * preserves Python/JS file references instead of loading their content.
 * @returns The loaded content if the input was a file path, otherwise the original input.
 * For JSON and YAML files, the content is parsed into an object.
 * For other file types, the raw file content is returned as a string.
 *
 * @throws {Error} If the specified file does not exist.
 */
export function maybeLoadFromExternalFile(
  filePath: string | object | Function | undefined | null,
  context?: FileLoadContext,
) {
  if (Array.isArray(filePath)) {
    return filePath.map((path) => {
      const content: any = maybeLoadFromExternalFile(path, context);
      return content;
    });
  }

  if (typeof filePath !== 'string') {
    return filePath;
  }
  if (!filePath.startsWith('file://')) {
    return filePath;
  }

  const reference = parseExternalFileReference(filePath);
  if (shouldPreserveExternalFileReference(reference, context)) {
    return reference.renderedFilePath;
  }

  const pathToUse = getExternalPathToUse(reference);

  const resolvedPath = path.resolve(cliState.basePath || '', pathToUse);

  if (hasMagic(pathToUse)) {
    return loadGlobContents(resolvedPath);
  }

  return readExternalFile(resolvedPath);
}

/**
 * Resolves a relative file path with respect to a base path, handling cloud configuration appropriately.
 * When using a cloud configuration, the current working directory is always used instead of the context's base path.
 *
 * @param filePath - The relative or absolute file path to resolve.
 * @param isCloudConfig - Whether this is a cloud configuration.
 * @returns The resolved absolute file path.
 */
export function getResolvedRelativePath(filePath: string, isCloudConfig?: boolean): string {
  // If it's already an absolute path, or not a cloud config, return it as is
  if (path.isAbsolute(filePath) || !isCloudConfig) {
    return filePath;
  }

  // Join the basePath and filePath to get the resolved path
  return path.join(process.cwd(), filePath);
}

/**
 * Recursively loads external file references from a configuration object.
 *
 * @param config - The configuration object to process
 * @param context - Optional context to control file loading behavior
 * @returns The configuration with external file references resolved
 */
export function maybeLoadConfigFromExternalFile(
  config: any,
  context?: 'assertion' | 'general' | 'vars',
): any {
  if (Array.isArray(config)) {
    return config.map((item) => maybeLoadConfigFromExternalFile(item, context));
  }
  if (typeof config === 'object' && config !== null) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(config)) {
      // Detect assertion contexts: if we have a sibling 'type' key with 'python' or 'javascript'
      // and current key is 'value', switch to assertion context
      const isAssertionValue =
        key === 'value' &&
        'type' in config &&
        typeof config.type === 'string' &&
        (config.type === 'python' || config.type === 'javascript');

      // Detect vars contexts: if we're processing a 'vars' key, switch to vars context
      // This preserves file:// glob patterns for test case expansion
      const isVarsField = key === 'vars';

      const childContext = isAssertionValue ? 'assertion' : isVarsField ? 'vars' : context;
      const value = maybeLoadConfigFromExternalFile(config[key], childContext);

      if (key === '__proto__') {
        Object.defineProperty(result, key, {
          value,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return maybeLoadFromExternalFile(config, context);
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
    filePath: path.join(basePath, safeFilename),
    functionName,
    isPathPattern,
  };
}

export function readOutput(outputPath: string): OutputFile {
  const ext = path.parse(outputPath).ext.slice(1);

  switch (ext) {
    case 'json':
      return JSON.parse(fs.readFileSync(outputPath, 'utf-8')) as OutputFile;
    default:
      throw new Error(`Unsupported output file format: ${ext} currently only supports json`);
  }
}

/**
 * Load custom Nunjucks filters from external files.
 * Note: If a glob pattern matches multiple files, only the last file's export is used.
 * Each filter name should typically resolve to a single file.
 */
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

/**
 * Loads configuration from an external file with variable rendering.
 * This is a convenience wrapper that combines renderVarsInObject and maybeLoadFromExternalFile.
 *
 * Use this for simple config fields that:
 * - Need variable rendering ({{ vars.x }}, {{ env.X }})
 * - May reference external files (file://path.json)
 * - Don't have nested file references that need loading
 *
 * For fields with nested file references (like response_format.schema),
 * use maybeLoadResponseFormatFromExternalFile instead.
 *
 * @param config - The configuration to process
 * @param vars - Variables for template rendering
 * @returns The processed configuration with variables rendered and files loaded
 */
export function maybeLoadFromExternalFileWithVars(
  config: any,
  vars?: Record<string, VarValue>,
): any {
  const rendered = renderVarsInObject(config, vars);
  return maybeLoadFromExternalFile(rendered);
}

/**
 * Loads response_format configuration from an external file with variable rendering.
 *
 * This function handles the special case where response_format may contain:
 * 1. A top-level file reference (file://format.json)
 * 2. A nested schema reference for json_schema type (schema: file://schema.json)
 *
 * Both levels need variable rendering and file loading.
 *
 * @param responseFormat - The response_format configuration
 * @param vars - Variables for template rendering
 * @returns The processed response_format with all files loaded
 */
export function maybeLoadResponseFormatFromExternalFile(
  responseFormat: any,
  vars?: Record<string, VarValue>,
): any {
  if (responseFormat === undefined || responseFormat === null) {
    return responseFormat;
  }

  // First, render variables and load the outer response_format
  const rendered = renderVarsInObject(responseFormat, vars);
  const loaded = maybeLoadFromExternalFile(rendered);

  if (!loaded || typeof loaded !== 'object') {
    return loaded;
  }

  // For json_schema type, check if the nested schema is a file reference
  if (loaded.type === 'json_schema') {
    const nestedSchema = loaded.schema || loaded.json_schema?.schema;

    if (nestedSchema) {
      // Render and load the nested schema
      const loadedSchema = maybeLoadFromExternalFile(renderVarsInObject(nestedSchema, vars));

      // Return with the loaded schema in place
      if (loaded.schema !== undefined) {
        return { ...loaded, schema: loadedSchema };
      } else if (loaded.json_schema?.schema !== undefined) {
        return {
          ...loaded,
          json_schema: { ...loaded.json_schema, schema: loadedSchema },
        };
      }
    }
  }

  return loaded;
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
  vars?: Record<string, VarValue>,
): Promise<any> {
  const rendered = renderVarsInObject(tools, vars);

  if (typeof rendered === 'string' && rendered.startsWith('file://')) {
    const { filePath, functionName } = parseFileUrl(rendered);

    if (functionName && isScriptFile(filePath)) {
      return loadToolsFromFunctionReference(rendered, filePath, functionName);
    }

    if (isScriptFile(filePath)) {
      throw createMissingToolFunctionError(rendered, filePath);
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

  const loaded = maybeLoadFromExternalFile(rendered);
  return validateLoadedTools(loaded);
}

async function loadToolsFromFunctionReference(
  rendered: string,
  filePath: string,
  functionName: string,
): Promise<any> {
  const fileType = filePath.endsWith('.py') ? 'Python' : 'JavaScript';
  logger.debug(
    `[maybeLoadToolsFromExternalFile] Loading tools from ${fileType} file: ${filePath}:${functionName}`,
  );

  try {
    const toolDefinitions = filePath.endsWith('.py')
      ? await loadPythonToolDefinitions(filePath, functionName)
      : await loadJavascriptToolDefinitions(filePath, functionName);

    validateToolDefinitions(functionName, toolDefinitions);
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

async function loadPythonToolDefinitions(filePath: string, functionName: string): Promise<any> {
  const absPath = safeResolve(cliState.basePath || process.cwd(), filePath);
  logger.debug(`[maybeLoadToolsFromExternalFile] Resolved Python path: ${absPath}`);
  return runPython(absPath, functionName, []);
}

async function loadJavascriptToolDefinitions(filePath: string, functionName: string): Promise<any> {
  const absPath = safeResolve(cliState.basePath || process.cwd(), filePath);
  logger.debug(`[maybeLoadToolsFromExternalFile] Resolved JavaScript path: ${absPath}`);

  const module = await importModule(absPath);
  const fn = module[functionName] || module.default?.[functionName];

  if (typeof fn !== 'function') {
    const availableExports = Object.keys(module).filter((key) => key !== 'default');
    const basePath = cliState.basePath || process.cwd();
    throw new Error(
      `Function "${functionName}" not found in ${filePath}. ` +
        `Available exports: ${availableExports.length > 0 ? availableExports.join(', ') : '(none)'}\n` +
        `Resolved from: ${basePath}`,
    );
  }

  return Promise.resolve(fn());
}

function validateToolDefinitions(functionName: string, toolDefinitions: unknown): void {
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
}

function createMissingToolFunctionError(rendered: string, filePath: string): Error {
  const ext = filePath.endsWith('.py') ? 'Python' : 'JavaScript';
  const basePath = cliState.basePath || process.cwd();

  return new Error(
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

function validateLoadedTools(loaded: any): any {
  if (loaded === undefined || loaded === null || typeof loaded !== 'string') {
    return loaded;
  }

  if (loaded.startsWith('file://')) {
    throw new Error(
      `Failed to load tools from ${loaded}\n` +
        `Ensure the file exists and contains valid JSON or YAML tool definitions.`,
    );
  }

  if (loaded.includes('def ') || loaded.includes('import ')) {
    throw new Error(
      `Invalid tools configuration: file appears to contain Python code.\n` +
        `Python files require a function name. Use this format:\n` +
        `  tools: file://tools.py:get_tools`,
    );
  }

  throw new Error(
    `Invalid tools configuration: expected an array or object, but got a string.\n` +
      `If using file://, ensure the file contains valid JSON or YAML tool definitions.`,
  );
}
