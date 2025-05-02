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
