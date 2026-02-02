/**
 * Array of supported JavaScript and TypeScript file extensions
 */
export const JAVASCRIPT_EXTENSIONS = ['js', 'cjs', 'mjs', 'ts', 'cts', 'mts'];

// Pre-compiled regex for JavaScript file detection (avoids regex compilation on each call)
const JAVASCRIPT_FILE_REGEX = new RegExp(`\\.(${JAVASCRIPT_EXTENSIONS.join('|')})$`);

// Extension sets for O(1) lookup (avoids array creation and O(n) includes() on each call)
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv', 'mkv', 'm4v']);
const AUDIO_EXTENSIONS = new Set([
  'wav',
  'mp3',
  'ogg',
  'aac',
  'm4a',
  'flac',
  'wma',
  'aiff',
  'opus',
]);

/**
 * Extracts the lowercase file extension from a path.
 */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) {
    return '';
  }
  return filePath.slice(lastDot + 1).toLowerCase();
}

/**
 * Checks if a file is a JavaScript or TypeScript file based on its extension.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a JavaScript or TypeScript extension, false otherwise.
 */
export function isJavascriptFile(filePath: string): boolean {
  return JAVASCRIPT_FILE_REGEX.test(filePath);
}

/**
 * Checks if a file is an image file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has an image extension, false otherwise.
 */
export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Checks if a file is a video file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has a video extension, false otherwise.
 */
export function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(getExtension(filePath));
}

/**
 * Checks if a file is an audio file based on its extension. Non-exhaustive list.
 *
 * @param filePath - The path of the file to check.
 * @returns True if the file has an audio extension, false otherwise.
 */
export function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.has(getExtension(filePath));
}
