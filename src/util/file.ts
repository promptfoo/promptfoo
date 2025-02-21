import { parse as csvParse } from 'csv-parse/sync';
import * as fs from 'fs';
import yaml from 'js-yaml';
import * as path from 'path';
import cliState from '../cliState';
import { getEnvBool } from '../envars';
import { getNunjucksEngine } from './templates';

/**
 * Array of supported JavaScript and TypeScript file extensions
 */
export const JAVASCRIPT_EXTENSIONS = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

/**
 * Checks if a file is a JavaScript or TypeScript file based on its extension.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a JavaScript or TypeScript extension, false otherwise.
 */
export function isJavascriptFile(filePath: string): boolean {
  return new RegExp(`\\.(${JAVASCRIPT_EXTENSIONS.join('|')})$`).test(filePath);
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
    const splits = filename.split(':');
    if (
      splits[0] &&
      (isJavascriptFile(splits[0]) || splits[0].endsWith('.py') || splits[0].endsWith('.go'))
    ) {
      [filename, functionName] = splits;
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

  const isPathPattern = stats?.isDirectory() || /[*?{}\[\]]/.test(filePath); // glob pattern
  const safeFilename = path.relative(
    basePath,
    path.isAbsolute(filename) ? filename : path.resolve(basePath, filename),
  );
  return {
    extension: isPathPattern ? undefined : path.parse(safeFilename).ext,
    filePath: safeFilename.startsWith(basePath) ? safeFilename : path.join(basePath, safeFilename),
    functionName,
    isPathPattern,
  };
}

/**
 * Loads content from an external file if the input is a file path, otherwise
 * returns the input as-is. Supports Nunjucks templating for file paths.
 *
 * @param filePath - The input to process. Can be a file path string starting with "file://",
 * an array of file paths, or any other type of data.
 * @returns The loaded content if the input was a file path, otherwise the original input.
 * For JSON and YAML files, the content is parsed into an object.
 * For other file types, the raw file content is returned as a string.
 *
 * @throws {Error} If the specified file does not exist.
 */
export function maybeLoadFromExternalFile(filePath: string | object | Function | undefined | null) {
  if (Array.isArray(filePath)) {
    return filePath.map((path) => {
      const content: any = maybeLoadFromExternalFile(path);
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
  const renderedFilePath = getNunjucksEngine().renderString(filePath, {});

  const finalPath = path.resolve(cliState.basePath || '', renderedFilePath.slice('file://'.length));
  if (!fs.existsSync(finalPath)) {
    throw new Error(`File does not exist: ${finalPath}`);
  }

  const contents = fs.readFileSync(finalPath, 'utf8');
  if (finalPath.endsWith('.json')) {
    return JSON.parse(contents);
  }
  if (finalPath.endsWith('.yaml') || finalPath.endsWith('.yml')) {
    return yaml.load(contents);
  }
  if (finalPath.endsWith('.csv')) {
    const records = csvParse(contents, { columns: true });
    // If single column, return array of values
    if (records.length > 0 && Object.keys(records[0]).length === 1) {
      return records.map((record: Record<string, string>) => Object.values(record)[0]);
    }
    return records;
  }
  return contents;
}
