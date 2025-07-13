import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/**
 * Get the directory name from an import.meta.url
 * @param metaUrl - The import.meta.url value
 * @returns The directory path
 */
export function getDirname(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl));
}

/**
 * Get the filename from an import.meta.url
 * @param metaUrl - The import.meta.url value
 * @returns The file path
 */
export function getFilename(metaUrl: string): string {
  return fileURLToPath(metaUrl);
}

/**
 * Get both dirname and filename from import.meta.url
 * @param metaUrl - The import.meta.url value
 * @returns Object containing both dirname and filename
 */
export function getPaths(metaUrl: string): { dirname: string; filename: string } {
  const filename = getFilename(metaUrl);
  const dirname = getDirname(metaUrl);
  return { dirname, filename };
}
