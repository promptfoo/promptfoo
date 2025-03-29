import $RefParser from '@apidevtools/json-schema-ref-parser';
import { parse as parseCsv } from 'csv-parse/sync';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';
import { parse as parsePath } from 'path';
import { getEnvBool, getEnvString } from '../envars';
import { importModule } from '../esm';
import { fetchCsvFromGoogleSheet } from '../googleSheets';
import { fetchHuggingFaceDataset } from '../integrations/huggingfaceDatasets';
import logger from '../logger';
import { runPython } from '../python/pythonUtils';
import telemetry from '../telemetry';
import { isJavascriptFile } from './file';

/**
 * Reads files from a glob pattern and returns their contents
 * @param pathOrGlobs - Path or glob pattern(s) to read
 * @param basePath - Base path for resolving relative paths
 * @returns A record mapping parsed content from the files
 */
export async function readFiles(
  pathOrGlobs: string | string[],
  basePath: string = '',
): Promise<Record<string, string | string[] | object>> {
  if (typeof pathOrGlobs === 'string') {
    pathOrGlobs = [pathOrGlobs];
  }

  const ret: Record<string, string | string[] | object> = {};
  for (const pathOrGlob of pathOrGlobs) {
    const resolvedPath = path.resolve(basePath, pathOrGlob);
    const paths = globSync(resolvedPath, {
      windowsPathsNoEscape: true,
    });

    for (const p of paths) {
      const yamlData = yaml.load(fs.readFileSync(p, 'utf-8'));
      Object.assign(ret, yamlData);
    }
  }
  return ret;
}

type FileContent = string | object | Array<any>;

/**
 * Options for loading a file
 */
export interface FileLoadOptions {
  /** Function name for JS/Python file execution (if applicable) */
  functionName?: string;
  /** Custom delimiter for CSV files */
  csvDelimiter?: string;
  /** Whether to enforce strict CSV parsing */
  csvStrict?: boolean;
  /** Base path for resolving relative paths */
  basePath?: string;
}

/**
 * Loads content from a file or URL, handling various formats
 * @param filePath - Path or URL to the file
 * @param options - Options for loading the file
 * @returns Promise resolving to the file content in an appropriate format
 */
export async function loadFile(
  filePath: string,
  options: FileLoadOptions = {},
): Promise<FileContent> {
  const {
    functionName,
    csvDelimiter = getEnvString('PROMPTFOO_CSV_DELIMITER', ','),
    csvStrict = getEnvBool('PROMPTFOO_CSV_STRICT', false),
    basePath = '',
  } = options;

  // Handle file:// prefix
  const resolvedPath = path.resolve(basePath, filePath.replace(/^file:\/\//, ''));

  // Split on the last colon to handle Windows drive letters correctly
  const colonCount = resolvedPath.split(':').length - 1;
  const lastColonIndex = resolvedPath.lastIndexOf(':');

  // For Windows paths, we need to account for the drive letter colon
  const isWindowsPath = /^[A-Za-z]:/.test(resolvedPath);
  const effectiveColonCount = isWindowsPath ? colonCount - 1 : colonCount;

  if (effectiveColonCount > 1) {
    throw new Error(`Too many colons. Invalid test file script path: ${filePath}`);
  }

  const pathWithoutFunction =
    lastColonIndex > 1 ? resolvedPath.slice(0, lastColonIndex) : resolvedPath;
  const maybeFunctionName =
    lastColonIndex > 1 ? resolvedPath.slice(lastColonIndex + 1) : functionName;
  const fileExtension = parsePath(pathWithoutFunction).ext.slice(1);

  // Handle special protocols
  if (filePath.startsWith('huggingface://datasets/')) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'huggingface dataset',
    });
    return await fetchHuggingFaceDataset(filePath);
  }

  // Handle JavaScript/TypeScript files
  if (isJavascriptFile(pathWithoutFunction)) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'js file',
    });
    const mod = await importModule(pathWithoutFunction, maybeFunctionName);
    return typeof mod === 'function' ? await mod() : mod;
  }

  // Handle Python files
  if (fileExtension === 'py') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'python file',
    });
    const result = await runPython(pathWithoutFunction, maybeFunctionName ?? 'generate_tests', []);
    // Check if result is an array for backward compatibility
    if (!Array.isArray(result) && typeof result === 'object') {
      throw new Error(
        `Python test function must return a list of test cases, got ${typeof result}`,
      );
    }
    return result;
  }

  // Handle Google Sheets
  if (filePath.startsWith('https://docs.google.com/spreadsheets/')) {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'google sheet',
    });
    return await fetchCsvFromGoogleSheet(filePath);
  }

  // Handle CSV files
  if (fileExtension === 'csv') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'csv file',
    });
    const fileContent = fs.readFileSync(pathWithoutFunction, 'utf-8');
    const enforceStrict = csvStrict;

    try {
      // First try parsing with strict mode if enforced
      if (enforceStrict) {
        return parseCsv(fileContent, {
          columns: true,
          bom: true,
          delimiter: csvDelimiter,
          relax_quotes: false,
        });
      } else {
        // Try strict mode first, fall back to relaxed if it fails
        try {
          return parseCsv(fileContent, {
            columns: true,
            bom: true,
            delimiter: csvDelimiter,
            relax_quotes: false,
          });
        } catch {
          // If strict parsing fails, try with relaxed quotes
          return parseCsv(fileContent, {
            columns: true,
            bom: true,
            delimiter: csvDelimiter,
            relax_quotes: true,
          });
        }
      }
    } catch (err) {
      // Add helpful context to the error message
      const e = err as { code?: string; message: string };
      if (e.code === 'CSV_INVALID_OPENING_QUOTE') {
        throw new Error(e.message);
      }
      throw e;
    }
  }

  // Handle JSONL files
  if (fileExtension === 'jsonl') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'jsonl file',
    });
    const fileContent = fs.readFileSync(pathWithoutFunction, 'utf-8');
    const jsonlContent = fileContent
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
    return await $RefParser.dereference(jsonlContent);
  }

  // Handle JSON files
  if (fileExtension === 'json') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'json file',
    });

    const jsonContent = JSON.parse(fs.readFileSync(pathWithoutFunction, 'utf-8'));
    return await $RefParser.dereference(jsonContent);
  }

  // Handle YAML files
  if (fileExtension === 'yaml' || fileExtension === 'yml') {
    telemetry.recordAndSendOnce('feature_used', {
      feature: 'yaml file',
    });
    const yamlContent = yaml.load(fs.readFileSync(pathWithoutFunction, 'utf-8'));
    return await $RefParser.dereference(yamlContent);
  }

  // Handle plain text and other files
  const content = fs.readFileSync(pathWithoutFunction, 'utf-8');

  // Check if multiple prompts are in one file (separated by delimiter)
  const promptSeparator = getEnvString('PROMPTFOO_PROMPT_SEPARATOR', '---');

  if (fileExtension !== 'md' && fileExtension !== 'j2' && content.includes(promptSeparator)) {
    return content.split(promptSeparator).map((part) => part.trim());
  }

  return content;
}

/**
 * Loads multiple files from a glob pattern
 * @param globPattern - Glob pattern to match files
 * @param options - Options for loading files
 * @returns Promise resolving to an array of loaded file contents
 */
export async function loadFilesFromGlob(
  globPattern: string,
  options: FileLoadOptions = {},
): Promise<FileContent[]> {
  const { basePath = '' } = options;

  if (globPattern.startsWith('huggingface://datasets/')) {
    return [await loadFile(globPattern, options)];
  }

  if (globPattern.startsWith('file://')) {
    globPattern = globPattern.slice('file://'.length);
  }

  const resolvedPath = path.resolve(basePath, globPattern);
  const filesPaths: Array<string> = globSync(resolvedPath, {
    windowsPathsNoEscape: true,
  });

  // Check for possible function names in the path
  const pathWithoutFunction: string = resolvedPath.split(':')[0];
  // Only add the file if it's not already included by glob and it's a special file type
  if (
    (isJavascriptFile(pathWithoutFunction) || pathWithoutFunction.endsWith('.py')) &&
    !filesPaths.some((file) => file === resolvedPath || file === pathWithoutFunction)
  ) {
    filesPaths.push(resolvedPath);
  }

  if (globPattern.startsWith('https://docs.google.com/spreadsheets/')) {
    filesPaths.push(globPattern);
  }

  const results: FileContent[] = [];

  for (const filePath of filesPaths) {
    try {
      const content = await loadFile(filePath, { ...options, basePath: path.dirname(filePath) });

      if (Array.isArray(content)) {
        results.push(...content);
      } else {
        results.push(content);
      }
    } catch (error) {
      logger.error(`Error loading file ${filePath}: ${error}`);
      throw error;
    }
  }

  return results;
}
