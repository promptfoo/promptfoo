import { parse as parsePath } from 'path';

/**
 * Checks if a file is a JavaScript or TypeScript file based on its extension.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a JavaScript or TypeScript extension, false otherwise.
 */
export function isJavascriptFile(filePath: string): boolean {
  return /\.(js|cjs|mjs|ts|cts|mts)$/.test(filePath);
}

interface PathWithFunction {
  path: string;
  functionName?: string;
  extension: string;
}

/**
 * Parses a path that may contain a function name after a colon.
 * Handles Windows paths correctly by accounting for drive letters.
 *
 * @param resolvedPath - The path to parse, which may include a function name after a colon
 * @param givenPath - The original path before any modifications
 * @returns Object containing the path, optional function name, and file extension
 * @throws Error if the path contains too many colons
 */
export function parsePathWithFunction(resolvedPath: string, givenPath: string): PathWithFunction {
  // Split on the last colon to handle Windows drive letters correctly
  const colonCount = resolvedPath.split(':').length - 1;
  const lastColonIndex = resolvedPath.lastIndexOf(':');

  // For Windows paths, we need to account for the drive letter colon
  const isWindowsPath = /^[A-Za-z]:/.test(resolvedPath);
  const effectiveColonCount = isWindowsPath ? colonCount - 1 : colonCount;

  if (effectiveColonCount > 1) {
    throw new Error(`Too many colons. Invalid script path: ${givenPath}`);
  }

  const pathWithoutFunction =
    lastColonIndex > 1 ? resolvedPath.slice(0, lastColonIndex) : resolvedPath;
  const functionName = lastColonIndex > 1 ? resolvedPath.slice(lastColonIndex + 1) : undefined;
  const extension = parsePath(pathWithoutFunction).ext.slice(1);

  return {
    path: pathWithoutFunction,
    functionName,
    extension,
  };
}
