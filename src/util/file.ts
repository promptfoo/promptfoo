import * as path from 'path';

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
 * Resolves a relative file path with respect to a base path, handling cloud configuration appropriately.
 * When using a cloud configuration, the current working directory is always used instead of the context's base path.
 *
 * @param filePath - The relative or absolute file path to resolve.
 * @param contextBasePath - The base path from the context (typically the directory containing the config file).
 * @param isCloudConfig - Whether this is a cloud configuration.
 * @returns The resolved absolute file path.
 */
export function getResolvedRelativePath(
  filePath: string,
  contextBasePath?: string,
  isCloudConfig?: boolean,
): string {
  // If it's already an absolute path, return it as is
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  // If using a cloud config, always use process.cwd() instead of contextBasePath
  const basePath = isCloudConfig === true ? process.cwd() : contextBasePath || process.cwd();

  // Join the basePath and filePath to get the resolved path
  return path.join(basePath, filePath);
}
