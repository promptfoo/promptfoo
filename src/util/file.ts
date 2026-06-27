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
import { sha256 } from './createHash';
import { isJavascriptFile } from './fileExtensions';
import { parseFileUrl } from './functions/loadFunction';
import { safeResolve } from './pathUtils';
import { renderEnvOnlyInObject, renderVarsInObject } from './render';

import type { NunjucksFilterMap, OutputFile, VarValue } from '../types';

type CsvParseOptionsWithColumns<T> = Omit<CsvOptions<T>, 'columns'> & {
  columns: Exclude<CsvOptions['columns'], undefined | false>;
};

type ExternalFileContext =
  | 'assertion'
  | 'assertions'
  | 'general'
  | 'json-schema-assertion'
  | 'test-config'
  | 'vars';

const JSON_SCHEMA_FILE_SNAPSHOT = Symbol.for('promptfoo.jsonSchemaFileSnapshot');
const JSON_SCHEMA_RENDERED_FILE_REF = Symbol.for('promptfoo.jsonSchemaRenderedFileRef');
const JSON_SCHEMA_FILE_ERROR = '__promptfooJsonSchemaFileError';

type PersistedJsonSchemaFileError = {
  error: string;
  fingerprint: string;
};

export type JsonSchemaFileSnapshot =
  | {
      source: string;
      format: 'parsed' | 'text';
      schema: unknown;
    }
  | {
      source: string;
      error: string;
      fingerprint: string;
    };

export function getJsonSchemaFileSnapshot(assertion: unknown): JsonSchemaFileSnapshot | undefined {
  if (typeof assertion !== 'object' || assertion === null) {
    return undefined;
  }
  const record = assertion as Record<PropertyKey, unknown>;
  const snapshot = record[JSON_SCHEMA_FILE_SNAPSHOT] as JsonSchemaFileSnapshot | undefined;
  if (snapshot) {
    return snapshot;
  }
  const persisted = record[JSON_SCHEMA_FILE_ERROR];
  if (
    typeof persisted === 'object' &&
    persisted !== null &&
    typeof (persisted as PersistedJsonSchemaFileError).error === 'string' &&
    typeof (persisted as PersistedJsonSchemaFileError).fingerprint === 'string'
  ) {
    const { error, fingerprint } = persisted as PersistedJsonSchemaFileError;
    return { source: `persisted:${fingerprint}`, error, fingerprint };
  }
  return undefined;
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
  context?: ExternalFileContext,
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

  if (context === 'json-schema-assertion') {
    logger.debug('Preserving JSON schema file reference');
    return filePath;
  }

  // Render the file path using Nunjucks
  const renderedFilePath = getNunjucksEngineForFilePath().renderString(filePath, {});

  // Parse the file URL to extract file path and function name using existing utility
  // This handles colon splitting correctly, including Windows drive letters (C:\path)
  const { filePath: cleanPath, functionName } = parseFileUrl(renderedFilePath);

  // In assertion contexts, always preserve Python/JS file references
  // This prevents premature dereferencing of assertion files that should be
  // handled by the assertion system, not the generic config loader
  if (context === 'assertion' && (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))) {
    logger.debug(`Preserving Python/JS file reference in assertion context: ${renderedFilePath}`);
    return renderedFilePath;
  }

  // In vars contexts, preserve all file:// references for test case expansion
  // This prevents premature file loading - JS/Python files should be executed at runtime
  // by renderPrompt in evaluatorHelpers.ts, and glob patterns should be expanded by
  // generateVarCombinations in evaluator.ts
  if (context === 'vars') {
    logger.debug(`Preserving file reference in vars context: ${renderedFilePath}`);
    return renderedFilePath;
  }

  // For Python/JS files with function names, return the original string unchanged
  // to allow the assertion system to handle function loading at execution time.
  // This prevents premature file existence checks that would fail for function references.
  if (functionName && (cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))) {
    return renderedFilePath;
  }

  // For non-Python/JS files, use the original path (ignore potential function name)
  const pathToUse =
    functionName && !(cleanPath.endsWith('.py') || isJavascriptFile(cleanPath))
      ? renderedFilePath.slice('file://'.length) // Use original path for non-script files
      : cleanPath;

  const resolvedPath = path.resolve(cliState.basePath || '', pathToUse);

  // Check if the path contains glob patterns
  if (hasMagic(pathToUse)) {
    // Use globSync to expand the pattern
    const matchedFiles = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

    if (matchedFiles.length === 0) {
      throw new Error(`No files found matching pattern: ${resolvedPath}`);
    }

    // Load all matched files and combine their contents
    const allContents: any[] = [];
    for (const matchedFile of matchedFiles) {
      let contents: string;
      try {
        contents = fs.readFileSync(matchedFile, 'utf8');
      } catch (error) {
        // File may have been deleted between glob and read (race condition)
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.debug(`File disappeared during glob expansion: ${matchedFile}`);
          continue;
        }
        throw error;
      }
      if (matchedFile.endsWith('.json')) {
        const parsed = JSON.parse(contents);
        if (Array.isArray(parsed)) {
          allContents.push(...parsed);
        } else {
          allContents.push(parsed);
        }
      } else if (matchedFile.endsWith('.yaml') || matchedFile.endsWith('.yml')) {
        const parsed = yaml.load(contents);
        if (parsed === null || parsed === undefined) {
          continue; // Skip empty files
        }
        if (Array.isArray(parsed)) {
          allContents.push(...parsed);
        } else {
          allContents.push(parsed);
        }
      } else if (matchedFile.endsWith('.csv')) {
        const csvOptions: CsvParseOptionsWithColumns<Record<string, string>> = {
          columns: true as const,
        };
        const records = csvParse<Record<string, string>>(contents, csvOptions);
        // If single column, return array of values to match single file behavior
        if (records.length > 0 && Object.keys(records[0]).length === 1) {
          allContents.push(...records.map((record) => Object.values(record)[0]));
        } else {
          allContents.push(...records);
        }
      } else {
        allContents.push(contents);
      }
    }

    return allContents;
  }

  // Original single file logic
  const finalPath = resolvedPath;

  let contents: string;
  try {
    contents = fs.readFileSync(finalPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File does not exist: ${finalPath}`);
    }
    throw new Error(`Failed to read file ${finalPath}: ${error}`);
  }
  if (finalPath.endsWith('.json')) {
    try {
      return JSON.parse(contents);
    } catch (error) {
      throw new Error(`Failed to parse JSON file ${finalPath}: ${error}`);
    }
  }
  if (finalPath.endsWith('.yaml') || finalPath.endsWith('.yml')) {
    try {
      return yaml.load(contents);
    } catch (error) {
      throw new Error(`Failed to parse YAML file ${finalPath}: ${error}`);
    }
  }
  if (finalPath.endsWith('.csv')) {
    const csvOptions: CsvParseOptionsWithColumns<Record<string, string>> = {
      columns: true as const,
    };
    const records = csvParse<Record<string, string>>(contents, csvOptions);
    // If single column, return array of values
    if (records.length > 0 && Object.keys(records[0]).length === 1) {
      return records.map((record) => Object.values(record)[0]);
    }
    return records;
  }
  return contents;
}

function captureJsonSchemaFile(
  renderedFileRef: string,
  publicFileRef: string,
  basePath: string | undefined,
  cache: Map<string, JsonSchemaFileSnapshot>,
): JsonSchemaFileSnapshot | undefined {
  const { filePath: cleanPath } = parseFileUrl(renderedFileRef);
  const isRubyScript = cleanPath.endsWith('.rb') || /\.rb:[^/\\]+$/.test(cleanPath);
  if (isJavascriptFile(cleanPath) || cleanPath.endsWith('.py') || isRubyScript) {
    return undefined;
  }

  const extension = path.extname(cleanPath).toLowerCase();
  const resolvedPath = path.resolve(basePath ?? cliState.basePath ?? '', cleanPath);
  const cached = cache.get(resolvedPath);
  if (cached) {
    return cached;
  }

  let fingerprint = `sha256:${sha256(publicFileRef)}`;
  try {
    const contents = fs.readFileSync(resolvedPath, 'utf8');
    fingerprint = `sha256:${sha256(contents)}`;
    const isParsedSchema = ['.json', '.yaml', '.yml'].includes(extension);
    const schema =
      extension === '.json'
        ? JSON.parse(contents)
        : extension === '.yaml' || extension === '.yml'
          ? yaml.load(contents)
          : contents;
    if (
      (isParsedSchema &&
        (schema === null || (typeof schema !== 'boolean' && typeof schema !== 'object'))) ||
      (!isParsedSchema && /^(?:null|~)?$/i.test(contents.trim()))
    ) {
      const snapshot = {
        source: renderedFileRef,
        error: 'schema file must contain an object or boolean schema',
        fingerprint,
      } as const;
      cache.set(resolvedPath, snapshot);
      return snapshot;
    }
    const snapshot = {
      source: renderedFileRef,
      format: isParsedSchema ? 'parsed' : 'text',
      schema,
    } as const;
    cache.set(resolvedPath, snapshot);
    return snapshot;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const safeError =
      code === 'ENOENT'
        ? 'schema file not found'
        : error instanceof SyntaxError && extension === '.json'
          ? 'invalid JSON schema file'
          : error instanceof yaml.YAMLException
            ? 'invalid YAML schema file'
            : 'schema file could not be read';
    const snapshot = { source: renderedFileRef, error: safeError, fingerprint };
    cache.set(resolvedPath, snapshot);
    return snapshot;
  }
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
  context?: ExternalFileContext,
  basePath?: string,
): any {
  return loadConfigFromExternalFile(config, context, basePath, new Map());
}

function loadConfigFromExternalFile(
  config: any,
  context: ExternalFileContext | undefined,
  basePath: string | undefined,
  schemaCache: Map<string, JsonSchemaFileSnapshot>,
): any {
  if (Array.isArray(config)) {
    return config.map((item) => loadConfigFromExternalFile(item, context, basePath, schemaCache));
  }
  if (typeof config === 'object' && config !== null) {
    if (context === 'assertions' && getJsonSchemaFileSnapshot(config)) {
      return config;
    }
    const privatelyRenderedJsonSchemaFileRef = config[JSON_SCHEMA_RENDERED_FILE_REF];
    const result: Record<string, any> = {};
    const assertionType =
      typeof config.type === 'string' ? config.type.replace(/^not-/, '') : undefined;
    for (const key of Object.keys(config)) {
      // Detect assertion contexts: if we have a sibling 'type' key with 'python' or 'javascript'
      // and current key is 'value', switch to assertion context
      const isAssertionValue =
        key === 'value' &&
        'type' in config &&
        typeof config.type === 'string' &&
        (config.type === 'python' || config.type === 'javascript');
      const isJsonSchemaAssertionFileValue =
        context === 'assertions' &&
        key === 'value' &&
        (assertionType === 'is-json' || assertionType === 'contains-json') &&
        typeof config[key] === 'string' &&
        config[key].startsWith('file://');

      // Detect vars contexts: if we're processing a 'vars' key, switch to vars context
      // This preserves file:// glob patterns for test case expansion
      const isVarsField = key === 'vars';
      const isAssertionsField =
        key === 'assert' && (context === 'test-config' || context === 'assertions');
      const inheritedContext =
        context === 'assertions' || context === 'test-config' ? undefined : context;

      const childContext = isJsonSchemaAssertionFileValue
        ? 'json-schema-assertion'
        : isAssertionValue
          ? 'assertion'
          : isVarsField
            ? 'vars'
            : isAssertionsField
              ? 'assertions'
              : inheritedContext;
      const value = loadConfigFromExternalFile(config[key], childContext, basePath, schemaCache);

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

    if (
      context === 'assertions' &&
      (assertionType === 'is-json' || assertionType === 'contains-json') &&
      typeof result.value === 'string' &&
      result.value.startsWith('file://')
    ) {
      const rawFileRef = result.value;
      const renderedFileRef =
        typeof privatelyRenderedJsonSchemaFileRef === 'string'
          ? privatelyRenderedJsonSchemaFileRef
          : renderEnvOnlyInObject(rawFileRef);
      const snapshot = captureJsonSchemaFile(renderedFileRef, rawFileRef, basePath, schemaCache);
      if (snapshot) {
        if ('error' in snapshot) {
          Object.defineProperty(result, JSON_SCHEMA_FILE_ERROR, {
            value: {
              error: snapshot.error,
              fingerprint: snapshot.fingerprint,
            } satisfies PersistedJsonSchemaFileError,
            enumerable: true,
            configurable: false,
            writable: false,
          });
        } else {
          delete result[JSON_SCHEMA_FILE_ERROR];
          result.value = snapshot.schema;
        }
        Object.defineProperty(result, JSON_SCHEMA_FILE_SNAPSHOT, {
          value: snapshot,
          enumerable: true,
          configurable: false,
          writable: false,
        });
      } else {
        result.value = renderedFileRef;
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
