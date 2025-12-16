import * as fs from 'fs';
import * as path from 'path';

import { parse as csvParse, type Options as CsvOptions } from 'csv-parse/sync';
import { globSync, hasMagic } from 'glob';
import yaml from 'js-yaml';
import nunjucks from 'nunjucks';
import cliState from '../cliState';
import logger from '../logger';
import { parseFileUrl } from './functions/loadFunction';
import { isJavascriptFile } from './fileExtensions';

type CsvParseOptionsWithColumns<T> = Omit<CsvOptions<T>, 'columns'> & {
  columns: Exclude<CsvOptions['columns'], undefined | false>;
};

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
  context?: 'assertion' | 'general' | 'vars',
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
      const contents = fs.readFileSync(matchedFile, 'utf8');
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
  if (!fs.existsSync(finalPath)) {
    throw new Error(`File does not exist: ${finalPath}`);
  }

  let contents: string;
  try {
    contents = fs.readFileSync(finalPath, 'utf8');
  } catch (error) {
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
  if (config && typeof config === 'object' && config !== null) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(config)) {
      // Detect assertion contexts: if we have a sibling 'type' key with 'python' or 'javascript'
      // and current key is 'value', switch to assertion context
      const isAssertionValue =
        key === 'value' &&
        typeof config === 'object' &&
        config &&
        'type' in config &&
        typeof config.type === 'string' &&
        (config.type === 'python' || config.type === 'javascript');

      // Detect vars contexts: if we're processing a 'vars' key, switch to vars context
      // This preserves file:// glob patterns for test case expansion
      const isVarsField = key === 'vars';

      const childContext = isAssertionValue ? 'assertion' : isVarsField ? 'vars' : context;
      result[key] = maybeLoadConfigFromExternalFile(config[key], childContext);
    }
    return result;
  }
  return maybeLoadFromExternalFile(config, context);
}
