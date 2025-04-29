import { parse as csvParse } from 'csv-parse/sync';
import yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { getNunjucksEngine } from './templates';
import cliState from '../cliState';

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
 * Checks if a file is an image file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has an image extension, false otherwise.
 */
export function isImageFile(filePath: string): boolean {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return imageExtensions.includes(fileExtension);
}

/**
 * Checks if a file is a video file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a video extension, false otherwise.
 */
export function isVideoFile(filePath: string): boolean {
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv', 'mkv', 'm4v'];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return videoExtensions.includes(fileExtension);
}

/**
 * Checks if a file is an audio file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has an audio extension, false otherwise.
 */
export function isAudioFile(filePath: string): boolean {
  const audioExtensions = ['wav', 'mp3', 'ogg', 'aac', 'm4a', 'flac', 'wma', 'aiff', 'opus'];
  const fileExtension = filePath.split('.').pop()?.toLowerCase() || '';
  return audioExtensions.includes(fileExtension);
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
